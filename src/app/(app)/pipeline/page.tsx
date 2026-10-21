import Link from "next/link";
import { load, requireCtx } from "@/lib/auth/current";
import { readParams, type SearchParams } from "@/lib/params";
import { listActiveUsers, listOpportunities, listReference, type OpportunityRow } from "@/server/crm";
import { OPEN_STAGES, STAGE_LABELS } from "@/domain/pipeline";
import { formatCents } from "@/domain/money";
import { Empty, fmtDate, PageHeader, StageBadge } from "@/components/ui";

const initials = (name: string | null) =>
  (name ?? "?").split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]!.toUpperCase()).join("");

function OppCard({ o, now }: { o: OpportunityRow; now: number }) {
  const overdue = o.next_action_at && new Date(o.next_action_at).getTime() < now;
  const days = Math.max(0, Math.floor((now - new Date(o.stage_changed_at).getTime()) / 86400000));
  return (
    <Link
      href={`/opportunities/${o.id}`}
      className={`block rounded-lg border bg-white p-3 text-sm shadow-[0_1px_2px_rgba(4,41,105,0.05)] transition hover:-translate-y-px hover:border-rh/40 hover:shadow-md hover:no-underline ${overdue ? "border-l-[3px] border-red-300 border-l-red-500" : "border-frost"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 font-semibold leading-snug text-navy">{o.company_name}</div>
        <span title={o.owner_name ?? "Unassigned"} className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${o.owner_name ? "bg-rh text-white" : "bg-mist text-slate-400"}`}>
          {o.owner_name ? initials(o.owner_name) : "–"}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
        {o.estimated_value_cents === null ? <span className="text-slate-400">No value yet</span> : <span className="font-display text-base font-bold tabular-nums text-navy">{formatCents(o.estimated_value_cents, o.currency)}</span>}
        {o.source ? <span className="truncate">· {o.source.replace(/_/g, " ")}</span> : null}
      </div>
      <div className="mt-2 border-t border-mist pt-2 text-xs">
        {o.next_action ? (
          <div className={`flex items-start gap-1 ${overdue ? "font-medium text-red-600" : "text-slate-600"}`}>
            <span aria-hidden>{overdue ? "⚠" : "→"}</span>
            <span className="min-w-0">{o.next_action}{o.next_action_at ? <span className="text-slate-400"> · {fmtDate(o.next_action_at)}</span> : null}</span>
          </div>
        ) : <div className="font-medium text-amber-700">No next action set</div>}
        <div className="mt-1 text-[11px] text-slate-400">{days === 0 ? "Entered stage today" : `${days} day${days === 1 ? "" : "s"} in stage`}</div>
      </div>
    </Link>
  );
}

export default async function PipelinePage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireCtx();
  const p = await readParams(searchParams);
  const now = new Date().getTime();
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
        eyebrow="Sales"
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
              <div key={stage} className="flex w-64 shrink-0 flex-col">
                <div className="mb-2 rounded-lg border border-frost bg-white px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="truncate text-[13px]">{STAGE_LABELS[stage]}</h2>
                    <span className="rounded-full bg-mist px-2 py-0.5 text-[11px] font-semibold text-navy tabular-nums">{col.length}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500 tabular-nums">{formatCents(col.reduce((s, o) => s + (o.estimated_value_cents ?? 0), 0), "USD")}</div>
                  <div className="mt-2 h-0.5 rounded-full brand-gradient" style={{ opacity: 0.25 + (OPEN_STAGES.indexOf(stage) / OPEN_STAGES.length) * 0.75 }} />
                </div>
                <div className="flex-1 space-y-2 rounded-lg bg-frost/40 p-2">
                  {col.length ? col.map((o) => <OppCard key={o.id} o={o} now={now} />) : <div className="py-6 text-center text-xs text-slate-400">No deals</div>}
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
