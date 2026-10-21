import Link from "next/link";
import { load, requireCtx } from "@/lib/auth/current";
import { can } from "@/lib/auth/user";
import { KanbanBoard } from "@/components/KanbanBoard";
import { readParams, type SearchParams } from "@/lib/params";
import { listActiveUsers, listOpportunities, listReference } from "@/server/crm";
import { formatCents } from "@/domain/money";
import { Empty, fmtDate, PageHeader, StageBadge } from "@/components/ui";

export const metadata = { title: "Pipeline" };

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
              <Link key={v} href={qs(v)} className={`chip ${view === v ? "chip-active" : ""}`}>{v === "lost" ? "Lost / nurture" : v[0].toUpperCase() + v.slice(1)}</Link>
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
        <KanbanBoard opps={opps} now={now} canMove={can(ctx.user, "crm.write")} />
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
