import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlarmClock, BadgeDollarSign, CalendarClock, CalendarDays, ChartNoAxesCombined, Clock, Coins, Download, Gauge, Handshake, Hourglass,
  Layers, Percent, PhoneCall, Recycle, Target, TrendingUp, UserPlus, Wallet,
} from "lucide-react";
import { requireCtx } from "@/lib/auth/current";
import { can } from "@/lib/auth/user";
import { readParams, type SearchParams } from "@/lib/params";
import { getDashboard } from "@/server/analytics";
import { listActiveUsers, listReference } from "@/server/crm";
import { STAGE_LABELS } from "@/domain/pipeline";
import { formatCents } from "@/domain/money";
import { Card, Empty, fmtNum, fmtPct, PageHeader, Stat } from "@/components/ui";

export const metadata = { title: "Dashboard" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <h2>{title}</h2>
        <div className="h-px flex-1 bg-frost" />
      </div>
      {children}
    </section>
  );
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireCtx();
  if (!can(ctx.user, "dashboard.read")) redirect(can(ctx.user, "referral.submit") ? "/referrals" : "/pipeline");
  const p = await readParams(searchParams);
  const filters = { from: p.from, to: p.to, vertical: p.vertical, source: p.source, ownerId: p.owner };
  const [dash, ref, users] = await Promise.all([getDashboard(ctx, filters), listReference(ctx.db), listActiveUsers(ctx)]);
  const m = dash.metrics;
  const cur = dash.baseCurrency;
  const money = (v: number | null) => (v === null ? "—" : formatCents(v, cur));
  const restricted = "—";
  const fin = dash.financialsVisible;
  const top = Math.max(1, dash.funnel[0]?.count ?? 1);
  const oppName = new Map(dash.data.opportunities.map((o) => [o.id, o.company_name]));
  const auditOpp = new Map(dash.data.audits.map((a) => [a.id, a.opportunity_id]));
  const propOpp = new Map(dash.data.proposals.map((x) => [x.id, x.opportunity_id]));
  const recordLink = (id: string) => {
    if (oppName.has(id)) return <Link href={`/opportunities/${id}`}>{oppName.get(id)}</Link>;
    if (auditOpp.has(id)) return <Link href={`/audits/${id}`}>Audit · {oppName.get(auditOpp.get(id)!) ?? id.slice(0, 8)}</Link>;
    if (propOpp.has(id)) return <Link href={`/proposals/${id}`}>Proposal · {oppName.get(propOpp.get(id)!) ?? id.slice(0, 8)}</Link>;
    return <Link href={`/deployments/${id}`}>Deployment {id.slice(0, 8)}</Link>;
  };
  const now = new Date();
  const presets: [string, string][] = [
    ["30 days", iso(new Date(now.getTime() - 29 * 86400000))],
    ["90 days", iso(new Date(now.getTime() - 89 * 86400000))],
    ["Year to date", `${now.getFullYear()}-01-01`],
  ];
  const presetHref = (from: string) => {
    const q = new URLSearchParams(Object.entries({ vertical: p.vertical, source: p.source, owner: p.owner, from, to: iso(now) }).filter(([, v]) => v) as [string, string][]);
    return `/?${q}`;
  };
  const displayName = ctx.user.fullName?.trim();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Executive dashboard"
        title={displayName ? `Welcome back, ${displayName}` : "Performance overview"}
        subtitle={<>{dash.period.from} → {dash.period.to} · amounts in {cur}{dash.excludedOtherCurrency ? ` · ${dash.excludedOtherCurrency} record(s) in other currencies excluded from sums` : ""}</>}
        actions={can(ctx.user, "export") ? (
          <div className="flex overflow-hidden rounded-lg border border-frost bg-white">
            {[["leads", "Leads"], ["pipeline", "Pipeline"], ["kpis", "KPIs"]].map(([k, l], i) => (
              <a key={k} href={`/api/exports/${k}`} className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-navy hover:bg-mist hover:no-underline ${i ? "border-l border-frost" : ""}`}>
                <Download className="size-3.5 text-rh" aria-hidden /> {l}
              </a>
            ))}
          </div>
        ) : null}
      />

      <form className="card flex flex-wrap items-end gap-3 p-4" method="get">
        <div className="flex flex-wrap items-center gap-1.5">
          <CalendarDays className="mr-1 size-4 text-slate-400" aria-hidden />
          {presets.map(([label, from]) => (
            <Link key={label} href={presetHref(from)} className={`rounded-full px-3 py-1 text-xs font-medium hover:no-underline ${dash.period.from === from ? "bg-navy text-white" : "bg-mist text-navy hover:bg-frost"}`}>{label}</Link>
          ))}
        </div>
        <label className="w-36"><span className="label">From</span><input className="input" type="date" name="from" defaultValue={dash.period.from} /></label>
        <label className="w-36"><span className="label">To</span><input className="input" type="date" name="to" defaultValue={dash.period.to} /></label>
        <label className="w-44"><span className="label">Vertical</span>
          <select className="input" name="vertical" defaultValue={p.vertical ?? ""}>
            <option value="">All verticals</option>
            {ref.verticals.map((v) => <option key={v.code} value={v.code}>{v.name}</option>)}
          </select>
        </label>
        <label className="w-44"><span className="label">Source</span>
          <select className="input" name="source" defaultValue={p.source ?? ""}>
            <option value="">All sources</option>
            {ref.sources.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
          </select>
        </label>
        <label className="w-44"><span className="label">Rep</span>
          <select className="input" name="owner" defaultValue={p.owner ?? ""}>
            <option value="">All reps</option>
            {users.filter((u) => ["SALES_REP", "ADMIN_MANAGER", "EXTERNAL_REP"].includes(u.role)).map((u) => <option key={u.id} value={u.id}>{u.full_name ?? u.email}</option>)}
          </select>
        </label>
        <div className="ml-auto flex gap-2">
          <Link className="btn btn-ghost" href="/">Reset</Link>
          <button className="btn btn-primary" type="submit">Apply filters</button>
        </div>
      </form>

      <Section title="Acquisition">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat icon={UserPlus} label="Leads" value={m.leads.value} hint="created in period" />
          <Stat icon={PhoneCall} label="Fit-call rate" value={fmtPct(m.fitCallRate.value)} hint={`${m.fitCallsCompleted.value} fit calls completed`} />
          <Stat icon={BadgeDollarSign} label="Paid audits" value={m.paidAudits.value} hint={`${money(m.auditRevenueCents.value)} audit revenue`} />
          <Stat icon={Target} label="Audit conversion" value={fmtPct(m.auditConversion.value)} hint={`of ${m.qualifiedFitCalls.value} qualified fit calls`} />
        </div>
      </Section>

      <Section title="Revenue">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat accent icon={TrendingUp} label="Won deployment revenue" value={money(m.wonDeploymentRevenueCents.value)} hint={`${m.wonDeployments.value} won · avg ${money(m.avgDeploymentValueCents.value)}`} />
          <Stat icon={Handshake} label="Audit → deployment" value={fmtPct(m.auditToDeployment.value)} hint={`${m.wonDeployments.value} won of ${m.auditsPresented.value} presented`} />
          <Stat icon={Percent} label="Win rate" value={fmtPct(m.winRate.value)} hint="won ÷ decided" />
          <Stat icon={Hourglass} label="Sales cycle" value={m.salesCycleToAuditDays.value === null ? "—" : `${fmtNum(m.salesCycleToAuditDays.value, 0)} d`} hint={`median to paid audit · ${m.salesCycleToWinDays.value === null ? "—" : `${fmtNum(m.salesCycleToWinDays.value, 0)} d`} to win`} />
        </div>
      </Section>

      <Section title="Delivery & economics">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          <Stat icon={Clock} label="Delivery hours" value={fmtNum(m.deliveryHours.value)} />
          <Stat icon={Gauge} label="Gross margin" value={fin ? fmtPct(m.grossMargin.value) : restricted} hint={fin ? `cost ${money(m.deliveryCostCents.value)}` : "financial roles only"} />
          <Stat icon={Wallet} label="MRR" value={fin ? money(m.mrrCents.value) : restricted} hint={fin ? "active retainers" : "financial roles only"} />
          <Stat icon={ChartNoAxesCombined} label="Client ROI" value={fin ? (m.clientRoi.value === null ? "—" : `${fmtNum(m.clientRoi.value, 2)}×`) : restricted} hint={fin ? "measured, annualized" : "financial roles only"} />
          <Stat icon={Recycle} label="Reusable" value={fmtPct(m.reusablePct.value)} hint="delivery components" />
          <Stat icon={Coins} label="CAC" value="—" hint="once ad spend exists" />
        </div>
      </Section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Conversion funnel" icon={Layers} className="lg:col-span-2">
          {m.leads.value === 0 ? <Empty>No leads in this period.</Empty> : (
            <ol className="space-y-2">
              {dash.funnel.map((f, i) => {
                const prev = i ? dash.funnel[i - 1].count : null;
                const conv = prev ? f.count / prev : null;
                return (
                  <li key={f.stage} className="grid grid-cols-[9.5rem_1fr_6.5rem] items-center gap-3 text-sm">
                    <span className="truncate font-medium text-slate-700">{STAGE_LABELS[f.stage]}</span>
                    <div className="h-6 overflow-hidden rounded-md bg-mist">
                      <div className="flex h-6 items-center rounded-md brand-gradient px-2 text-xs font-semibold text-white" style={{ width: `${Math.max(f.count ? 6 : 0, (f.count / top) * 100)}%` }}>
                        {f.count || ""}
                      </div>
                    </div>
                    <span className="text-right text-xs tabular-nums text-slate-500">
                      {conv !== null ? <span className={conv < 0.5 ? "text-cta-600" : "text-emerald-700"}>{fmtPct(conv)} from prev.</span> : `${f.count} leads`}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>

        <Card title="Follow-ups" icon={AlarmClock} actions={<Link href="/followups" className="text-sm">Open queue →</Link>}>
          <div className="space-y-3">
            {([
              ["Overdue", dash.followUps.overdue, "bg-red-50 text-red-700", AlarmClock],
              ["Due today", dash.followUps.today, "bg-amber-50 text-amber-700", CalendarClock],
              ["Next 7 days", dash.followUps.next7, "bg-mist text-rh", CalendarDays],
            ] as const).map(([label, n, tone, Icon]) => (
              <Link key={label} href="/followups" className="flex items-center gap-3 rounded-lg border border-frost p-3 hover:border-rh/30 hover:bg-mist/60 hover:no-underline">
                <span className={`flex size-9 items-center justify-center rounded-lg ${tone}`}><Icon className="size-4" aria-hidden /></span>
                <span className="flex-1 text-sm font-medium text-slate-700">{label}</span>
                <span className={`font-display text-2xl font-bold tabular-nums ${label === "Overdue" && n ? "text-red-600" : "text-navy"}`}>{n}</span>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {([["By source", dash.bySource], ["By vertical", dash.byVertical], ["By rep", dash.byRep]] as const).map(([title, rows]) => {
          const maxRev = Math.max(1, ...rows.map((r) => r.wonRevenueCents));
          return (
            <Card key={title} title={title}>
              {rows.length === 0 ? <Empty>No data in this period.</Empty> : (
                <table className="table">
                  <thead><tr><th className="pl-0"></th><th className="text-right">Leads</th><th className="text-right">Audits</th><th className="text-right">Won rev.</th></tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.key}>
                        <td className="max-w-[9rem] pl-0">
                          <div className="truncate font-medium text-slate-700">{r.label}</div>
                          <div className="mt-1 h-1 rounded-full bg-mist"><div className="h-1 rounded-full bg-cyan" style={{ width: `${(r.wonRevenueCents / maxRev) * 100}%` }} /></div>
                        </td>
                        <td className="text-right tabular-nums">{r.leads}</td>
                        <td className="text-right tabular-nums">{r.paidAudits}</td>
                        <td className="text-right font-medium tabular-nums text-navy">{money(r.wonRevenueCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          );
        })}
      </div>

      <details className="card group p-0">
        <summary className="flex cursor-pointer items-center justify-between gap-3 px-5 py-4">
          <span>
            <span className="font-display text-[15px] font-bold tracking-wider text-navy uppercase">How these numbers are calculated</span>
            <span className="muted ml-2">Every metric links to the records behind it.</span>
          </span>
          <span className="text-sm text-rh group-open:hidden">Show</span>
          <span className="hidden text-sm text-rh group-open:inline">Hide</span>
        </summary>
        <div className="divide-y divide-mist border-t border-frost px-5">
          {Object.entries(m).map(([key, metric]) => (
            <details key={key} className="py-2">
              <summary className="cursor-pointer text-sm">
                <span className="font-medium text-navy">{key}</span> <span className="text-slate-500">— {metric.formula}</span>{" "}
                <span className="text-slate-400">({metric.records.length})</span>
              </summary>
              {metric.records.length ? (
                <ul className="mt-1 ml-4 list-disc text-sm">
                  {metric.records.slice(0, 50).map((id) => <li key={id}>{recordLink(id)}</li>)}
                </ul>
              ) : <p className="muted ml-4">No records.</p>}
            </details>
          ))}
        </div>
      </details>
    </div>
  );
}
