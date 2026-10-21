import Link from "next/link";
import { load, requireCtx } from "@/lib/auth/current";
import { readParams, type SearchParams } from "@/lib/params";
import { listActiveUsers, listOpportunities, listReference, type OpportunityRow } from "@/server/crm";
import { OPEN_STAGES, STAGE_LABELS } from "@/domain/pipeline";
import { formatCents } from "@/domain/money";
import { Badge, Empty, fmtDate, PageHeader, StageBadge } from "@/components/ui";

function OppCard({ o }: { o: OpportunityRow }) {
  const overdue = o.next_action_at && new Date(o.next_action_at) < new Date();
  return (
    <Link href={`/opportunities/${o.id}`} className="block rounded-md border border-slate-200 bg-white p-2 text-sm shadow-xs hover:border-brand-600 hover:no-underline">
      <div className="font-medium text-slate-900">{o.company_name}</div>
      <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-slate-500">
        <span className="tabular-nums">{formatCents(o.estimated_value_cents, o.currency)}</span>·<span>{o.owner_name ?? "Unassigned"}</span>
        {o.source ? <Badge>{o.source}</Badge> : null}
      </div>
      {o.next_action ? (
        <div className={`mt-1 text-xs ${overdue ? "font-medium text-red-600" : "text-slate-600"}`}>
          → {o.next_action} {o.next_action_at ? `(${fmtDate(o.next_action_at)})` : ""}
        </div>
      ) : <div className="mt-1 text-xs text-amber-700">No next action</div>}
    </Link>
  );
}

export default async function PipelinePage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireCtx();
  const p = await readParams(searchParams);
  const view = (["open", "won", "lost", "all"].includes(p.view ?? "") ? p.view : "open") as "open" | "won" | "lost" | "all";
  const [opps, ref, users] = await load(Promise.all([
    listOpportunities(ctx, { view, ownerId: p.owner, source: p.source, vertical: p.vertical, q: p.q }),
    listReference(ctx.db),
    listActiveUsers(ctx),
  ]));
  const qs = (v: string) => {
    const u = new URLSearchParams(Object.entries({ ...p, view: v }).filter(([, x]) => x) as [string, string][]);
    u.delete("ok");
    u.delete("error");
    return `/pipeline?${u}`;
  };
  const lossName = new Map(ref.lossReasons.map((r) => [r.code, r.name]));

  return (
    <div>
      <PageHeader
        title="Pipeline"
        subtitle={`${opps.length} opportunit${opps.length === 1 ? "y" : "ies"} · total ${formatCents(opps.reduce((s, o) => s + (o.currency === "USD" ? o.estimated_value_cents ?? 0 : 0), 0), "USD")}`}
        actions={
          <div className="flex gap-1">
            {(["open", "won", "lost", "all"] as const).map((v) => (
              <Link key={v} href={qs(v)} className={`btn hover:no-underline ${view === v ? "btn-primary" : ""}`}>{v === "lost" ? "Lost / nurture" : v[0].toUpperCase() + v.slice(1)}</Link>
            ))}
          </div>
        }
      />
      <form className="card mb-4 grid grid-cols-2 gap-3 md:grid-cols-5" method="get">
        <input type="hidden" name="view" value={view} />
        <label><span className="label">Search</span><input className="input" name="q" defaultValue={p.q} placeholder="Company, keyword, campaign" /></label>
        <label><span className="label">Rep</span>
          <select className="input" name="owner" defaultValue={p.owner ?? ""}>
            <option value="">All</option>
            {users.filter((u) => ["SALES_REP", "ADMIN_MANAGER", "EXTERNAL_REP"].includes(u.role)).map((u) => <option key={u.id} value={u.id}>{u.full_name ?? u.email}</option>)}
          </select>
        </label>
        <label><span className="label">Source</span>
          <select className="input" name="source" defaultValue={p.source ?? ""}>
            <option value="">All</option>
            {ref.sources.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
          </select>
        </label>
        <label><span className="label">Vertical</span>
          <select className="input" name="vertical" defaultValue={p.vertical ?? ""}>
            <option value="">All</option>
            {ref.verticals.map((v) => <option key={v.code} value={v.code}>{v.name}</option>)}
          </select>
        </label>
        <div className="flex items-end gap-2"><button className="btn btn-primary">Filter</button><Link href="/pipeline" className="btn hover:no-underline">Reset</Link></div>
      </form>

      {opps.length === 0 ? <Empty>No opportunities match. <Link href="/leads/new">Create a lead</Link>.</Empty> : view === "open" ? (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {OPEN_STAGES.map((stage) => {
            const col = opps.filter((o) => o.stage === stage);
            return (
              <div key={stage} className="w-60 shrink-0">
                <div className="mb-2 flex items-baseline justify-between">
                  <h2 className="text-sm">{STAGE_LABELS[stage]}</h2>
                  <span className="text-xs text-slate-500 tabular-nums">{col.length} · {formatCents(col.reduce((s, o) => s + (o.estimated_value_cents ?? 0), 0), "USD")}</span>
                </div>
                <div className="space-y-2 rounded-lg bg-slate-100 p-2">
                  {col.length ? col.map((o) => <OppCard key={o.id} o={o} />) : <div className="py-4 text-center text-xs text-slate-400">Empty</div>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead><tr><th>Company</th><th>Stage</th><th>Owner</th><th>Source / campaign</th><th className="text-right">Value</th><th>{view === "lost" ? "Loss reason / nurture" : "Updated"}</th></tr></thead>
            <tbody>
              {opps.map((o) => (
                <tr key={o.id}>
                  <td><Link href={`/opportunities/${o.id}`}>{o.company_name}</Link></td>
                  <td><StageBadge stage={o.stage} /></td>
                  <td>{o.owner_name ?? "—"}</td>
                  <td>{o.source ?? "—"}{o.campaign ? ` / ${o.campaign}` : ""}</td>
                  <td className="text-right tabular-nums">{formatCents(o.estimated_value_cents, o.currency)}</td>
                  <td>{o.stage === "LOST_NURTURE" ? `${o.loss_reason ? lossName.get(o.loss_reason) ?? o.loss_reason : "—"}${o.nurture_at ? ` · nurture ${fmtDate(o.nurture_at)}` : ""}` : fmtDate(o.stage_changed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
