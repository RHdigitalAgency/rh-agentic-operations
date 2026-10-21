import Link from "next/link";
import { load, requireCtx } from "@/lib/auth/current";
import { can } from "@/lib/auth/user";
import { readParams, type SearchParams } from "@/lib/params";
import { followUpQueue, type OpportunityRow } from "@/server/crm";
import { FollowUpList } from "@/components/FollowUpList";
import { Card, Empty, PageHeader } from "@/components/ui";

export const metadata = { title: "Follow-ups" };

function Queue({ title, rows, tone, back, now, canAct, empty }: { title: string; rows: OpportunityRow[]; tone?: string; back: string; now: number; canAct: boolean; empty: string }) {
  return (
    <Card title={<span className={tone}>{title} ({rows.length})</span>}>
      {rows.length === 0 ? <Empty>{empty}</Empty> : <FollowUpList rows={rows} back={back} now={now} canAct={canAct} />}
    </Card>
  );
}

export default async function FollowUpsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireCtx();
  const p = await readParams(searchParams);
  const mine = p.mine === "1";
  const now = new Date().getTime();
  const q = await load(followUpQueue(ctx, { ownerId: mine ? ctx.user.id : undefined }));
  const back = mine ? "/followups?mine=1" : "/followups";
  const canAct = can(ctx.user, "crm.write") && can(ctx.user, "activity.write");
  const shared = { back, now, canAct };
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Sales"
        title="Follow-up queue"
        subtitle="Open opportunities by next-action due date. Mark a follow-up done to log it and set the next step, or snooze it."
        actions={<Link className="btn hover:no-underline" href={mine ? "/followups" : "/followups?mine=1"}>{mine ? "Show all visible" : "Only mine"}</Link>}
      />
      <Queue title="Overdue" rows={q.overdue} tone="text-red-700" empty="Nothing overdue — nice work." {...shared} />
      <Queue title="Due today" rows={q.today} empty="Nothing else due today." {...shared} />
      <Queue title="Next 7 days" rows={q.next7} empty="Nothing scheduled for the coming week." {...shared} />
      <Queue title="Missing next action" rows={q.missing} tone="text-amber-700" empty="Every open deal has a next step." {...shared} />
    </div>
  );
}
