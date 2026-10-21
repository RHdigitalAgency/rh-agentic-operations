import { can, requireCap } from "@/lib/auth/user";
import { optDay } from "@/lib/validate";
import { baseCurrency } from "@/domain/money";
import { computeDashboard, type AnalyticsData, type Period } from "@/domain/analytics";
import { opportunityVisible, Sql, type Ctx } from "./context";
import { getInternalHourlyCostCents } from "./settings";

export interface DashboardFilters {
  from?: string;
  to?: string;
  vertical?: string;
  source?: string;
  ownerId?: string;
}

export function resolvePeriod(f: DashboardFilters, now = new Date()): Period {
  const to = optDay(f.to, "To") ?? now.toISOString().slice(0, 10);
  const from = optDay(f.from, "From") ?? new Date(new Date(`${to}T00:00:00Z`).getTime() - 89 * 86400000).toISOString().slice(0, 10);
  return from <= to ? { from, to } : { from: to, to: from };
}

/** Loads every record behind the dashboard, scoped to the caller and filtered by vertical/source/rep. */
export async function loadAnalyticsData(ctx: Ctx, f: DashboardFilters): Promise<AnalyticsData> {
  const q = new Sql();
  const where = ["o.archived_at is null", opportunityVisible(q, ctx.user, "o", "c")];
  if (f.vertical) where.push(`c.vertical = ${q.p(f.vertical)}`);
  if (f.source) where.push(`o.source = ${q.p(f.source)}`);
  if (f.ownerId) where.push(`o.owner_user_id = ${q.p(f.ownerId)}`);
  const universe = `select o.id from opportunities o join companies c on c.id = o.company_id where ${where.join(" and ")}`;
  const p = q.params;
  const db = ctx.db;
  const [opportunities, history, fitCalls, audits, proposals, deployments, effort, retainers, kpis] = await Promise.all([
    db.query<AnalyticsData["opportunities"][number]>(
      `select o.id, o.created_at, o.stage, o.source, c.vertical, o.owner_user_id, u.full_name as owner_name, c.name as company_name, o.loss_reason, o.next_action_at
       from opportunities o join companies c on c.id = o.company_id left join app_users u on u.id = o.owner_user_id where o.id in (${universe})`,
      p,
    ),
    db.query<AnalyticsData["history"][number]>(`select opportunity_id, to_stage, changed_at from opportunity_stage_history where opportunity_id in (${universe})`, p),
    db.query<AnalyticsData["fitCalls"][number]>(`select opportunity_id, completed_at, outcome, audit_recommended from fit_calls where opportunity_id in (${universe})`, p),
    db.query<AnalyticsData["audits"][number]>(`select id, opportunity_id, status, price_cents, currency, paid_at, presentation_at from audits where opportunity_id in (${universe})`, p),
    db.query<AnalyticsData["proposals"][number]>(`select id, opportunity_id, proposal_type, status, amount_cents, audit_credit_cents, currency, decision_at from proposals where opportunity_id in (${universe})`, p),
    db.query<AnalyticsData["deployments"][number]>(
      `select d.id, d.proposal_id, d.reusable_components, d.total_components from deployments d join proposals pr on pr.id = d.proposal_id where pr.opportunity_id in (${universe})`,
      p,
    ),
    db.query<AnalyticsData["effort"][number]>(
      `select e.deployment_id, e.work_date, e.hours, e.direct_cost_cents from deployment_effort_entries e join deployments d on d.id = e.deployment_id
       join proposals pr on pr.id = d.proposal_id where pr.opportunity_id in (${universe})`,
      p,
    ),
    db.query<AnalyticsData["retainers"][number]>(
      `select r.id, r.proposal_id, r.mrr_cents, r.currency, r.status from retainers r join proposals pr on pr.id = r.proposal_id where pr.opportunity_id in (${universe})`,
      p,
    ),
    db.query<AnalyticsData["kpis"][number]>(
      `select k.* from kpi_measurements k join deployments d on d.id = k.deployment_id join proposals pr on pr.id = d.proposal_id where pr.opportunity_id in (${universe})`,
      p,
    ),
  ]);
  return { opportunities, history, fitCalls, audits, proposals, deployments, effort, retainers, kpis };
}

export async function getDashboard(ctx: Ctx, f: DashboardFilters = {}) {
  requireCap(ctx.user, "dashboard.read");
  const period = resolvePeriod(f);
  const data = await loadAnalyticsData(ctx, f);
  const dash = computeDashboard(data, period, { baseCurrency: baseCurrency(), internalHourlyCostCents: await getInternalHourlyCostCents(ctx.db) });
  if (!can(ctx.user, "financials.read")) {
    // Limited financial view: hide margin, delivery cost, MRR and client ROI.
    for (const k of ["grossMargin", "deliveryCostCents", "mrrCents", "clientRoi"] as const) {
      dash.metrics[k] = { value: null, records: [], formula: "Restricted to financial roles" };
    }
  }
  const safeData = can(ctx.user, "financials.read")
    ? data
    : { ...data, effort: data.effort.map((e) => ({ ...e, direct_cost_cents: 0 })), retainers: [] };
  return { ...dash, financialsVisible: can(ctx.user, "financials.read"), data: safeData };
}
