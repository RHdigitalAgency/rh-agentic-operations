import Link from "next/link";
import { load, requireCtx } from "@/lib/auth/current";
import { readParams, type SearchParams } from "@/lib/params";
import { followUpQueue, type OpportunityRow } from "@/server/crm";
import { Card, Empty, fmtDateTime, PageHeader, StageBadge } from "@/components/ui";

function Queue({ title, rows, tone }: { title: string; rows: OpportunityRow[]; tone?: string }) {
  return (
    <Card title={<span className={tone}>{title} ({rows.length})</span>}>
      {rows.length === 0 ? <Empty>Nothing here.</Empty> : (
        <table className="table">
          <thead><tr><th>Company</th><th>Stage</th><th>Next action</th><th>Due</th><th>Owner</th></tr></thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id}>
                <td><Link href={`/opportunities/${o.id}`}>{o.company_name}</Link></td>
                <td><StageBadge stage={o.stage} /></td>
                <td>{o.next_action ?? <span className="text-amber-700">Define next action</span>}</td>
                <td className="whitespace-nowrap">{fmtDateTime(o.next_action_at)}</td>
                <td>{o.owner_name ?? "Unassigned"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

export default async function FollowUpsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireCtx();
  const p = await readParams(searchParams);
  const mine = p.mine === "1";
  const q = await load(followUpQueue(ctx, { ownerId: mine ? ctx.user.id : undefined }));
  return (
    <div className="space-y-4">
      <PageHeader
        title="Follow-up queue"
        subtitle="Open opportunities by next-action due date"
        actions={<Link className="btn hover:no-underline" href={mine ? "/followups" : "/followups?mine=1"}>{mine ? "Show all visible" : "Only mine"}</Link>}
      />
      <Queue title="Overdue" rows={q.overdue} tone="text-red-700" />
      <Queue title="Due today" rows={q.today} />
      <Queue title="Next 7 days" rows={q.next7} />
      <Queue title="Missing next action" rows={q.missing} tone="text-amber-700" />
    </div>
  );
}
