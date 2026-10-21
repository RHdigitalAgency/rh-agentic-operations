import { compareKpis, type KpiRow } from "./kpi";
import { deliveryCostCents, grossMargin } from "./money";
import { STAGES, stageIndex, type Stage } from "./pipeline";

/** Inputs are already scoped to what the caller may see and filtered by vertical/source/rep. */
export interface AnalyticsData {
  opportunities: { id: string; created_at: Date; stage: Stage; source: string | null; vertical: string | null; owner_user_id: string | null; owner_name: string | null; company_name: string; loss_reason: string | null; next_action_at: Date | null }[];
  history: { opportunity_id: string; to_stage: Stage; changed_at: Date }[];
  fitCalls: { opportunity_id: string; completed_at: Date | null; outcome: string | null; audit_recommended: boolean | null }[];
  audits: { id: string; opportunity_id: string; status: string; price_cents: number; currency: string; paid_at: Date | null; presentation_at: Date | null }[];
  proposals: { id: string; opportunity_id: string; proposal_type: string; status: string; amount_cents: number; audit_credit_cents?: number; currency: string; decision_at: Date | null }[];
  deployments: { id: string; proposal_id: string; reusable_components: number; total_components: number }[];
  effort: { deployment_id: string; work_date: string; hours: number; direct_cost_cents: number }[];
  retainers: { id: string; proposal_id: string; mrr_cents: number; currency: string; status: string }[];
  kpis: (KpiRow & { deployment_id: string })[];
}

export interface Period {
  from: string; // YYYY-MM-DD inclusive
  to: string; // YYYY-MM-DD inclusive
}

export interface Metric {
  value: number | null;
  /** Ids of the records that produce this metric (traceability / reconciliation). */
  records: string[];
  formula: string;
}

const ratio = (n: number, d: number) => (d > 0 ? n / d : null);

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function computeDashboard(data: AnalyticsData, period: Period, opts: { baseCurrency: string; internalHourlyCostCents: number; now?: Date }) {
  const start = new Date(`${period.from}T00:00:00.000Z`).getTime();
  const end = new Date(`${period.to}T00:00:00.000Z`).getTime() + 86400000;
  const inP = (d: Date | string | null | undefined) => {
    if (!d) return false;
    const t = new Date(d).getTime();
    return t >= start && t < end;
  };
  const base = opts.baseCurrency;
  const oppById = new Map(data.opportunities.map((o) => [o.id, o]));
  const days = (a: Date, b: Date) => (new Date(b).getTime() - new Date(a).getTime()) / 86400000;
  const uniq = (xs: string[]) => [...new Set(xs)];

  // Leads & fit calls
  const leads = data.opportunities.filter((o) => inP(o.created_at));
  const fitDone = uniq(data.fitCalls.filter((f) => inP(f.completed_at)).map((f) => f.opportunity_id));
  const qualified = uniq(data.fitCalls.filter((f) => inP(f.completed_at) && f.outcome === "QUALIFIED").map((f) => f.opportunity_id));

  // Audits
  const paid = data.audits.filter((a) => a.status !== "CANCELLED" && inP(a.paid_at));
  const paidBase = paid.filter((a) => a.currency === base);
  const presented = data.audits.filter((a) => a.status === "PRESENTED" && inP(a.presentation_at));

  // Won implementation (pilot / deployment / SMB starter)
  const wonImpl = data.proposals.filter((p) => p.status === "ACCEPTED" && p.proposal_type !== "RETAINER" && inP(p.decision_at));
  const wonImplBase = wonImpl.filter((p) => p.currency === base);
  // Implementation revenue is the net price after any audit credit (the audit fee is already counted as audit revenue).
  const net = (p: { amount_cents: number; audit_credit_cents?: number }) => p.amount_cents - (p.audit_credit_cents ?? 0);
  const wonRevenue = wonImplBase.reduce((s, p) => s + net(p), 0);

  // Win rate from stage history
  const wonOpps = uniq(data.history.filter((h) => (h.to_stage === "WON_DEPLOYMENT" || h.to_stage === "WON_RETAINER") && inP(h.changed_at)).map((h) => h.opportunity_id));
  const lostOpps = uniq(
    data.history.filter((h) => h.to_stage === "LOST_NURTURE" && inP(h.changed_at) && oppById.get(h.opportunity_id)?.stage === "LOST_NURTURE" && oppById.get(h.opportunity_id)?.loss_reason)
      .map((h) => h.opportunity_id),
  ).filter((id) => !wonOpps.includes(id));

  // Sales cycle
  const cycleToAudit = paid.map((a) => (oppById.get(a.opportunity_id) ? days(oppById.get(a.opportunity_id)!.created_at, a.paid_at!) : null)).filter((x): x is number => x !== null);
  const cycleToWin = wonImpl.map((p) => (oppById.get(p.opportunity_id) ? days(oppById.get(p.opportunity_id)!.created_at, p.decision_at!) : null)).filter((x): x is number => x !== null);

  // Delivery: cohort = deployments created from implementation proposals won in the period
  const wonIds = new Set(wonImplBase.map((p) => p.id));
  const cohort = data.deployments.filter((d) => wonIds.has(d.proposal_id));
  const proposalById = new Map(data.proposals.map((p) => [p.id, p]));
  const effortByDep = new Map<string, { hours: number; direct: number }>();
  for (const e of data.effort) {
    const cur = effortByDep.get(e.deployment_id) ?? { hours: 0, direct: 0 };
    cur.hours += Number(e.hours);
    cur.direct += Number(e.direct_cost_cents);
    effortByDep.set(e.deployment_id, cur);
  }
  const periodEffort = data.effort.filter((e) => inP(e.work_date));
  const deliveryHours = periodEffort.reduce((s, e) => s + Number(e.hours), 0);
  const cohortRevenue = cohort.reduce((s, d) => { const pr = proposalById.get(d.proposal_id); return s + (pr ? net(pr) : 0); }, 0);
  const cohortCost = cohort.reduce((s, d) => {
    const e = effortByDep.get(d.id) ?? { hours: 0, direct: 0 };
    return s + deliveryCostCents(e.hours, opts.internalHourlyCostCents, e.direct);
  }, 0);

  // Client ROI: annualized measured monthly benefit / implementation revenue (deployments with measured benefit only)
  let roiBenefit = 0;
  let roiRevenue = 0;
  const roiRecords: string[] = [];
  for (const d of cohort) {
    const benefit = compareKpis(data.kpis.filter((k) => k.deployment_id === d.id)).reduce((s, c) => s + (c.latestResult?.benefit_monthly_cents ?? 0), 0);
    if (benefit > 0) {
      roiBenefit += benefit * 12;
      const pr = proposalById.get(d.proposal_id);
      roiRevenue += pr ? net(pr) : 0;
      roiRecords.push(d.id);
    }
  }

  const reusable = cohort.reduce((s, d) => s + d.reusable_components, 0);
  const totalComponents = cohort.reduce((s, d) => s + d.total_components, 0);

  // MRR: active retainers now (not period bound)
  const activeRetainers = data.retainers.filter((r) => r.status === "ACTIVE" && r.currency === base);

  // Funnel: of leads created in the period, how many reached each stage
  const maxReached = new Map<string, number>();
  for (const h of data.history) {
    if (h.to_stage === "LOST_NURTURE") continue;
    maxReached.set(h.opportunity_id, Math.max(maxReached.get(h.opportunity_id) ?? 0, stageIndex(h.to_stage)));
  }
  const funnel = STAGES.filter((s) => s !== "LOST_NURTURE" && s !== "WON_RETAINER").map((stage) => {
    const idx = stageIndex(stage);
    const ids = leads.filter((o) => (maxReached.get(o.id) ?? 0) >= idx || (stage === "WON_DEPLOYMENT" && maxReached.get(o.id) === stageIndex("WON_RETAINER"))).map((o) => o.id);
    return { stage, count: ids.length };
  });

  // Breakdowns
  type Row = { key: string; label: string; leads: number; paidAudits: number; auditRevenueCents: number; won: number; wonRevenueCents: number };
  const breakdown = (keyOf: (o: AnalyticsData["opportunities"][number]) => [string, string]) => {
    const rows = new Map<string, Row>();
    const row = (oppId: string) => {
      const o = oppById.get(oppId);
      if (!o) return null;
      const [key, label] = keyOf(o);
      if (!rows.has(key)) rows.set(key, { key, label, leads: 0, paidAudits: 0, auditRevenueCents: 0, won: 0, wonRevenueCents: 0 });
      return rows.get(key)!;
    };
    for (const o of leads) row(o.id)!.leads++;
    for (const a of paidBase) {
      const r = row(a.opportunity_id);
      if (r) {
        r.paidAudits++;
        r.auditRevenueCents += a.price_cents;
      }
    }
    for (const p of wonImplBase) {
      const r = row(p.opportunity_id);
      if (r) {
        r.won++;
        r.wonRevenueCents += net(p);
      }
    }
    return [...rows.values()].sort((a, b) => b.leads - a.leads || b.wonRevenueCents - a.wonRevenueCents);
  };

  // Follow-ups (current state, not period bound)
  const now = opts.now ?? new Date();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const open = data.opportunities.filter((o) => stageIndex(o.stage) < stageIndex("WON_DEPLOYMENT"));
  const overdue = open.filter((o) => o.next_action_at && new Date(o.next_action_at) < now);
  const dueToday = open.filter((o) => o.next_action_at && new Date(o.next_action_at) >= now && new Date(o.next_action_at) <= endOfToday);
  const next7 = open.filter((o) => o.next_action_at && new Date(o.next_action_at) > endOfToday && new Date(o.next_action_at).getTime() <= endOfToday.getTime() + 7 * 86400000);

  const m = (value: number | null, records: string[], formula: string): Metric => ({ value, records, formula });
  return {
    period,
    baseCurrency: base,
    metrics: {
      leads: m(leads.length, leads.map((o) => o.id), "Opportunities created in period"),
      fitCallsCompleted: m(fitDone.length, fitDone, "Opportunities with a fit call completed in period"),
      fitCallRate: m(ratio(fitDone.length, leads.length), fitDone, "Completed fit calls ÷ leads"),
      qualifiedFitCalls: m(qualified.length, qualified, "Fit calls completed as Qualified in period"),
      paidAudits: m(paid.length, paid.map((a) => a.id), "Audits with payment confirmed in period"),
      auditRevenueCents: m(paidBase.reduce((s, a) => s + a.price_cents, 0), paidBase.map((a) => a.id), `Sum of paid audit prices (${base})`),
      auditConversion: m(ratio(paid.length, qualified.length), paid.map((a) => a.id), "Paid audits ÷ qualified fit calls"),
      auditsPresented: m(presented.length, presented.map((a) => a.id), "Audits presented in period"),
      wonDeployments: m(wonImpl.length, wonImpl.map((p) => p.id), "Accepted pilot/deployment/starter proposals in period"),
      auditToDeployment: m(ratio(wonImpl.length, presented.length), wonImpl.map((p) => p.id), "Won pilot/deployment ÷ audits presented"),
      wonDeploymentRevenueCents: m(wonRevenue, wonImplBase.map((p) => p.id), `Sum of accepted implementation proposals (${base})`),
      avgDeploymentValueCents: m(wonImplBase.length ? Math.round(wonRevenue / wonImplBase.length) : null, wonImplBase.map((p) => p.id), "Won deployment revenue ÷ deployments"),
      winRate: m(ratio(wonOpps.length, wonOpps.length + lostOpps.length), [...wonOpps, ...lostOpps], "Won ÷ (won + lost with loss reason) in period"),
      salesCycleToAuditDays: m(median(cycleToAudit), paid.map((a) => a.id), "Median days lead created → audit paid"),
      salesCycleToWinDays: m(median(cycleToWin), wonImpl.map((p) => p.id), "Median days lead created → deployment won"),
      deliveryHours: m(deliveryHours, uniq(periodEffort.map((e) => e.deployment_id)), "Internal hours logged in period"),
      deliveryCostCents: m(cohortCost, cohort.map((d) => d.id), "Hours × internal hourly cost + direct cost, deployments won in period"),
      grossMargin: m(grossMargin(cohortRevenue, cohortCost), cohort.map((d) => d.id), "(Revenue − delivery cost) ÷ revenue, deployments won in period"),
      mrrCents: m(activeRetainers.reduce((s, r) => s + r.mrr_cents, 0), activeRetainers.map((r) => r.id), "Active retainers (current)"),
      clientRoi: m(roiRevenue > 0 ? roiBenefit / roiRevenue : null, roiRecords, "Annualized measured benefit ÷ implementation revenue"),
      reusablePct: m(ratio(reusable, totalComponents), cohort.map((d) => d.id), "Reusable components ÷ total components"),
      cac: m(null, [], "Acquisition spend ÷ new paying clients — not tracked until ad spend exists"),
    },
    funnel,
    bySource: breakdown((o) => [o.source ?? "unknown", o.source ?? "Unknown"]),
    byVertical: breakdown((o) => [o.vertical ?? "unknown", o.vertical ?? "Unassigned"]),
    byRep: breakdown((o) => [o.owner_user_id ?? "unassigned", o.owner_name ?? "Unassigned"]),
    followUps: { overdue: overdue.length, today: dueToday.length, next7: next7.length },
    excludedOtherCurrency: paid.length - paidBase.length + (wonImpl.length - wonImplBase.length),
  };
}

export type Dashboard = ReturnType<typeof computeDashboard>;

/**
 * Revenue per calendar month (UTC) for the last `months` months, base currency only: paid audit fees by payment date
 * and won implementation work (net of audit credit) by decision date. Retainers are excluded (see MRR).
 */
export function monthlyRevenue(data: Pick<AnalyticsData, "audits" | "proposals">, opts: { baseCurrency: string; months?: number; now?: Date }) {
  const n = opts.months ?? 6;
  const now = opts.now ?? new Date();
  const buckets = Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (n - 1 - i), 1));
    return { key: d.toISOString().slice(0, 7), label: d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }), auditCents: 0, implementationCents: 0 };
  });
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  const month = (d: Date | null) => (d ? byKey.get(new Date(d).toISOString().slice(0, 7)) : undefined);
  for (const a of data.audits) {
    const b = a.status !== "CANCELLED" && a.currency === opts.baseCurrency ? month(a.paid_at) : undefined;
    if (b) b.auditCents += a.price_cents;
  }
  for (const p of data.proposals) {
    const b = p.status === "ACCEPTED" && p.proposal_type !== "RETAINER" && p.currency === opts.baseCurrency ? month(p.decision_at) : undefined;
    if (b) b.implementationCents += p.amount_cents - (p.audit_credit_cents ?? 0);
  }
  return buckets;
}
