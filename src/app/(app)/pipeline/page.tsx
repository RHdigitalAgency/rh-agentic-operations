import Link from "next/link";
import { load, requireCtx } from "@/lib/auth/current";
import { can } from "@/lib/auth/user";
import { KanbanBoard } from "@/components/KanbanBoard";
import { readParams, type SearchParams } from "@/lib/params";
import { sortRows } from "@/lib/sort";
import { endOfZonedDay } from "@/lib/time";
import { SortHeader } from "@/components/SortHeader";
import { listActiveUsers, listOpportunities, listReference } from "@/server/crm";
import { formatCents } from "@/domain/money";
import { Empty, fmtDate, PageHeader, StageBadge } from "@/components/ui";

export const metadata = { title: "Pipeline" };

export default async function PipelinePage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireCtx();
  const p = await readParams(searchParams);
  const now = new Date().getTime();
  const endOfToday = endOfZonedDay(new Date(now)).getTime();
  const attention = p.attention === "1";
  const view = (["open", "won", "lost", "all"].includes(p.view ?? "") ? p.view : "open") as "open" | "won" | "lost" | "all";
  const [allOpps, ref, users] = await load(Promise.all([
    listOpportunities(ctx, { view, ownerId: p.owner, source: p.source, vertical: p.vertical, q: p.q }),
    listReference(ctx.db),
    listActiveUsers(ctx),
  ]));
  // "Needs attention": overdue, due today, or no next action yet.
  const needsAttention = (o: (typeof allOpps)[number]) => !o.next_action || !o.next_action_at || new Date(o.next_action_at).getTime() <= endOfToday;
  const opps = attention ? allOpps.filter(needsAttention) : allOpps;
  const attentionCount = allOpps.filter(needsAttention).length;
  const qs = (v: string, extra: Record<string, string | undefined> = {}) => {
    const u = new URLSearchParams(Object.entries({ ...p, view: v, ...extra }).filter(([, x]) => x) as [string, string][]);
    u.delete("ok");
    u.delete("error");
    return `/pipeline?${u}`;
  };
  const lossName = new Map(ref.lossReasons.map((r) => [r.code, r.name]));
  const tableRows = view === "open" ? opps : sortRows(opps, {
    company: (o) => o.company_name,
    stage: (o) => o.stage,
    owner: (o) => o.owner_name,
    source: (o) => o.source,
    value: (o) => o.estimated_value_cents,
    updated: (o) => o.stage_changed_at,
  }, p.sort, p.dir);
  const h = (label: string, field: string, align?: "right", firstDir: "asc" | "desc" = "asc") => <SortHeader label={label} field={field} params={p} path="/pipeline" align={align} firstDir={firstDir} />;

  return (
    <div>
      <PageHeader
        eyebrow="Sales"
        title="Pipeline"
        subtitle={`${opps.length} opportunit${opps.length === 1 ? "y" : "ies"} · total ${formatCents(opps.reduce((s, o) => s + (o.currency === "USD" ? o.estimated_value_cents ?? 0 : 0), 0), "USD")}`}
        actions={
          <div className="flex flex-wrap gap-1">
            {view === "open" ? (
              <Link href={qs("open", { attention: attention ? undefined : "1" })} className={`chip ${attention ? "bg-amber-500 text-white ring-amber-500 hover:bg-amber-600" : "text-amber-800 ring-amber-300"}`}>
                Needs attention ({attentionCount})
              </Link>
            ) : null}
            {(["open", "won", "lost", "all"] as const).map((v) => (
              <Link key={v} href={qs(v, { attention: undefined })} className={`chip ${view === v && !attention ? "chip-active" : ""}`}>{v === "lost" ? "Lost / nurture" : v[0].toUpperCase() + v.slice(1)}</Link>
            ))}
          </div>
        }
      />
      <form className="card mb-4 grid grid-cols-2 gap-3 md:grid-cols-5" method="get">
        <input type="hidden" name="view" value={view} />
        {attention ? <input type="hidden" name="attention" value="1" /> : null}
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

      {opps.length === 0 ? <Empty>{attention ? <>Nothing needs attention right now. <Link href={qs("open", { attention: undefined })}>Show all open deals</Link>.</> : <>No opportunities match. <Link href="/leads/new">Create a lead</Link>.</>}</Empty> : view === "open" ? (
        <KanbanBoard opps={opps} now={now} endOfToday={endOfToday} canMove={can(ctx.user, "crm.write")} />
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead><tr>{h("Company", "company")}{h("Stage", "stage")}{h("Owner", "owner")}{h("Source / campaign", "source")}{h("Value", "value", "right", "desc")}{view === "lost" ? <th>Loss reason / nurture</th> : h("Updated", "updated", undefined, "desc")}</tr></thead>
            <tbody>
              {tableRows.map((o) => (
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
