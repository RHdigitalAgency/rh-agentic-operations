import Link from "next/link";
import type { OpportunityRow } from "@/server/crm";
import { FollowUpActions } from "./FollowUpActions";
import { fmtDateTime, StageBadge } from "./ui";

/** Follow-up rows with inline Done / Snooze. Stacks on phones; one line per deal on wider screens. */
export function FollowUpList({ rows, back, now, canAct, showOwner = true }: { rows: OpportunityRow[]; back: string; now: number; canAct: boolean; showOwner?: boolean }) {
  return (
    <ul className="divide-y divide-mist">
      {rows.map((o) => {
        const due = o.next_action_at ? new Date(o.next_action_at).getTime() : null;
        const overdue = due !== null && due < now;
        return (
          <li key={o.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/opportunities/${o.id}`} className="font-semibold text-navy">{o.company_name}</Link>
                <StageBadge stage={o.stage} />
              </div>
              <div className="mt-0.5 text-sm">
                {o.next_action ?? <span className="text-amber-700">Define next action</span>}
                <span className={`ml-2 text-xs whitespace-nowrap ${overdue ? "font-medium text-red-600" : "text-slate-500"}`}>
                  {due === null ? "" : `${overdue ? "was due " : "due "}${fmtDateTime(o.next_action_at)}`}
                </span>
                {showOwner ? <span className="ml-2 text-xs text-slate-400">· {o.owner_name ?? "Unassigned"}</span> : null}
              </div>
            </div>
            {canAct ? <FollowUpActions o={o} back={back} now={now} /> : null}
          </li>
        );
      })}
    </ul>
  );
}
