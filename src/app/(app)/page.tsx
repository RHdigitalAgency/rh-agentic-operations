import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCtx } from "@/lib/auth/current";
import { can } from "@/lib/auth/user";
import { readParams, type SearchParams } from "@/lib/params";
import { getDashboard } from "@/server/analytics";
import { listActiveUsers, listReference } from "@/server/crm";
import { STAGE_LABELS } from "@/domain/pipeline";
import { formatCents } from "@/domain/money";
import { Card, Empty, fmtNum, fmtPct, PageHeader, Stat } from "@/components/ui";

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireCtx();
  if (!can(ctx.user, "dashboard.read")) redirect(can(ctx.user, "referral.submit") ? "/referrals" : "/pipeline");
  const p = await readParams(searchParams);
  const filters = { from: p.from, to: p.to, vertical: p.vertical, source: p.source, ownerId: p.owner };
  const [dash, ref, users] = await Promise.all([getDashboard(ctx, filters), listReference(ctx.db), listActiveUsers(ctx)]);
  const m = dash.metrics;
  const cur = dash.baseCurrency;
  const money = (v: number | null) => (v === null ? "—" : formatCents(v, cur));
  const restricted = "Restricted";
  const maxFunnel = Math.max(1, ...dash.funnel.map((f) => f.count));
  const oppName = new Map(dash.data.opportunities.map((o) => [o.id, o.company_name]));
  const auditOpp = new Map(dash.data.audits.map((a) => [a.id, a.opportunity_id]));
  const propOpp = new Map(dash.data.proposals.map((x) => [x.id, x.opportunity_id]));
  const recordLink = (id: string) => {
    if (oppName.has(id)) return <Link href={`/opportunities/${id}`}>{oppName.get(id)}</Link>;
    if (auditOpp.has(id)) return <Link href={`/audits/${id}`}>Audit · {oppName.get(auditOpp.get(id)!) ?? id.slice(0, 8)}</Link>;
    if (propOpp.has(id)) return <Link href={`/proposals/${id}`}>Proposal · {oppName.get(propOpp.get(id)!) ?? id.slice(0, 8)}</Link>;
    return <Link href={`/deployments/${id}`}>Deployment {id.slice(0, 8)}</Link>;
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Executive dashboard"
        subtitle={`Period ${dash.period.from} → ${dash.period.to} · amounts in ${cur}${dash.excludedOtherCurrency ? ` · ${dash.excludedOtherCurrency} record(s) in other currencies excluded from sums` : ""}`}
        actions={can(ctx.user, "export") ? (
          <>
            <a className="btn hover:no-underline" href={`/api/exports/leads`}>Export leads CSV</a>
            <a className="btn hover:no-underline" href={`/api/exports/pipeline`}>Pipeline CSV</a>
            <a className="btn hover:no-underline" href={`/api/exports/kpis`}>KPIs CSV</a>
          </>
        ) : null}
      />

      <form className="card grid grid-cols-2 gap-3 md:grid-cols-6" method="get">
        <label><span className="label">From</span><input className="input" type="date" name="from" defaultValue={dash.period.from} /></label>
        <label><span className="label">To</span><input className="input" type="date" name="to" defaultValue={dash.period.to} /></label>
        <label><span className="label">Vertical</span>
          <select className="input" name="vertical" defaultValue={p.vertical ?? ""}>
            <option value="">All</option>
            {ref.verticals.map((v) => <option key={v.code} value={v.code}>{v.name}</option>)}
          </select>
        </label>
        <label><span className="label">Source</span>
          <select className="input" name="source" defaultValue={p.source ?? ""}>
            <option value="">All</option>
            {ref.sources.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
          </select>
        </label>
        <label><span className="label">Rep</span>
          <select className="input" name="owner" defaultValue={p.owner ?? ""}>
            <option value="">All</option>
            {users.filter((u) => ["SALES_REP", "ADMIN_MANAGER", "EXTERNAL_REP"].includes(u.role)).map((u) => <option key={u.id} value={u.id}>{u.full_name ?? u.email}</option>)}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button className="btn btn-primary" type="submit">Apply</button>
          <Link className="btn hover:no-underline" href="/">Reset</Link>
        </div>
      </form>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <Stat label="Leads" value={m.leads.value} />
        <Stat label="Fit-call rate" value={fmtPct(m.fitCallRate.value)} hint={`${m.fitCallsCompleted.value} completed`} />
        <Stat label="Paid audits" value={m.paidAudits.value} hint={money(m.auditRevenueCents.value)} />
        <Stat label="Audit conversion" value={fmtPct(m.auditConversion.value)} hint={`of ${m.qualifiedFitCalls.value} qualified fit calls`} />
        <Stat label="Audit → deployment" value={fmtPct(m.auditToDeployment.value)} hint={`${m.wonDeployments.value} won / ${m.auditsPresented.value} presented`} />
        <Stat label="Win rate" value={fmtPct(m.winRate.value)} />
        <Stat label="Won deployment revenue" value={money(m.wonDeploymentRevenueCents.value)} hint={`avg ${money(m.avgDeploymentValueCents.value)}`} />
        <Stat label="Sales cycle (median)" value={m.salesCycleToAuditDays.value === null ? "—" : `${fmtNum(m.salesCycleToAuditDays.value, 0)} d`} hint={`to paid audit · ${m.salesCycleToWinDays.value === null ? "—" : `${fmtNum(m.salesCycleToWinDays.value, 0)} d`} to win`} />
        <Stat label="Delivery hours" value={fmtNum(m.deliveryHours.value)} />
        <Stat label="Gross margin" value={dash.financialsVisible ? fmtPct(m.grossMargin.value) : restricted} hint={dash.financialsVisible ? `cost ${money(m.deliveryCostCents.value)}` : undefined} />
        <Stat label="MRR" value={dash.financialsVisible ? money(m.mrrCents.value) : restricted} hint="active retainers" />
        <Stat label="Client ROI" value={dash.financialsVisible ? (m.clientRoi.value === null ? "—" : `${fmtNum(m.clientRoi.value, 2)}×`) : restricted} hint="measured, annualized" />
        <Stat label="Reusable %" value={fmtPct(m.reusablePct.value)} hint="delivery components" />
        <Stat label="CAC" value="—" hint="tracked once ad spend exists" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Funnel (leads created in period)" className="lg:col-span-2">
          {m.leads.value === 0 ? <Empty>No leads in this period.</Empty> : (
            <div className="space-y-1.5">
              {dash.funnel.map((f) => (
                <div key={f.stage} className="grid grid-cols-[10rem_1fr_3rem] items-center gap-2 text-sm">
                  <span className="truncate text-slate-600">{STAGE_LABELS[f.stage]}</span>
                  <div className="h-4 rounded bg-slate-100"><div className="h-4 rounded bg-brand-600" style={{ width: `${(f.count / maxFunnel) * 100}%` }} /></div>
                  <span className="text-right tabular-nums">{f.count}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title="Follow-ups" actions={<Link href="/followups">Open queue →</Link>}>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div><div className={`text-2xl font-semibold ${dash.followUps.overdue ? "text-red-600" : ""}`}>{dash.followUps.overdue}</div><div className="muted">Overdue</div></div>
            <div><div className="text-2xl font-semibold">{dash.followUps.today}</div><div className="muted">Today</div></div>
            <div><div className="text-2xl font-semibold">{dash.followUps.next7}</div><div className="muted">Next 7 days</div></div>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {([["By source", dash.bySource], ["By vertical", dash.byVertical], ["By rep", dash.byRep]] as const).map(([title, rows]) => (
          <Card key={title} title={title}>
            {rows.length === 0 ? <Empty>No data.</Empty> : (
              <table className="table">
                <thead><tr><th></th><th className="text-right">Leads</th><th className="text-right">Audits</th><th className="text-right">Won</th><th className="text-right">Won rev.</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key}>
                      <td className="max-w-[9rem] truncate">{r.label}</td>
                      <td className="text-right tabular-nums">{r.leads}</td>
                      <td className="text-right tabular-nums">{r.paidAudits}</td>
                      <td className="text-right tabular-nums">{r.won}</td>
                      <td className="text-right tabular-nums">{money(r.wonRevenueCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        ))}
      </div>

      <Card title="Reconciliation — records behind each metric">
        <p className="muted mb-2">Every number above is computed from these underlying records, using the same filters.</p>
        <div className="divide-y divide-slate-100">
          {Object.entries(m).map(([key, metric]) => (
            <details key={key} className="py-1.5">
              <summary className="cursor-pointer text-sm">
                <span className="font-medium">{key}</span> <span className="text-slate-500">— {metric.formula}</span>{" "}
                <span className="text-slate-400">({metric.records.length} record{metric.records.length === 1 ? "" : "s"})</span>
              </summary>
              {metric.records.length ? (
                <ul className="mt-1 ml-4 list-disc text-sm">
                  {metric.records.slice(0, 50).map((id) => <li key={id}>{recordLink(id)}</li>)}
                </ul>
              ) : <p className="muted ml-4">No records.</p>}
            </details>
          ))}
        </div>
      </Card>
    </div>
  );
}
