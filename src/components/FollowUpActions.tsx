import { Check } from "lucide-react";
import { completeFollowUpAction, snoozeFollowUpAction } from "@/app/actions";
import type { OpportunityRow } from "@/server/crm";
import { SubmitButton } from "./SubmitButton";
import { Hidden, toLocalInput } from "./ui";
import { zonedAt } from "@/lib/time";

const ACTIVITY_LABELS: [string, string][] = [["CALL", "Call"], ["DM", "DM"], ["EMAIL", "Email"], ["MEETING", "Meeting"], ["TASK", "Task"], ["NOTE", "Note"]];

/** Two days out at 09:00 business time: the default deadline for the next step. */
const inTwoDays = (now: number) => zonedAt(2, 9, 0, new Date(now));

/**
 * One-click follow-up handling: snooze 1 day / 1 week, or mark done (logs what happened and sets the next step).
 * Works without client JavaScript; the "Done" form opens in a small panel.
 */
export function FollowUpActions({ o, back, now }: { o: OpportunityRow; back: string; now: number }) {
  return (
    <div className="flex items-center justify-end gap-1">
      {o.next_action
        ? [1, 7].map((days) => (
            <form key={days} action={snoozeFollowUpAction}>
              <Hidden name="id" value={o.id} />
              <Hidden name="days" value={String(days)} />
              <Hidden name="_back" value={back} />
              <SubmitButton className="btn btn-ghost px-2 py-1 text-xs" title={`Push the deadline ${days === 1 ? "one day" : "one week"}`}>
                {days === 1 ? "+1 day" : "+1 week"}
              </SubmitButton>
            </form>
          ))
        : null}
      <details className="group relative">
        <summary className="btn btn-primary cursor-pointer list-none px-2.5 py-1 text-xs [&::-webkit-details-marker]:hidden">
          <Check className="size-3.5" aria-hidden /> Done
        </summary>
        <form action={completeFollowUpAction} className="card absolute right-0 z-20 mt-1 w-80 space-y-2 p-4 text-left shadow-lg">
          <Hidden name="id" value={o.id} />
          <Hidden name="_back" value={back} />
          <div className="text-xs text-slate-500">
            {o.next_action ? <>Completing: <b className="text-navy">{o.next_action}</b></> : "Log what happened and set the next step."}
          </div>
          <div className="flex flex-wrap gap-1">
            {ACTIVITY_LABELS.map(([v, l], i) => (
              <label key={v} className="cursor-pointer">
                <input type="radio" name="activity_type" value={v} defaultChecked={i === 0} className="peer sr-only" />
                <span className="chip normal-case peer-checked:bg-rh peer-checked:text-white peer-checked:ring-rh peer-focus-visible:ring-2 peer-focus-visible:ring-signal">{l}</span>
              </label>
            ))}
          </div>
          <textarea className="input min-h-14" name="notes" placeholder="What happened? (optional)" />
          <label className="block"><span className="label">Next step</span><input className="input" name="next_action" required placeholder="e.g. Send audit offer" /></label>
          <label className="block"><span className="label">Due</span><input className="input" type="datetime-local" name="next_action_at" required defaultValue={toLocalInput(inTwoDays(now))} /></label>
          <SubmitButton className="btn btn-cta w-full justify-center">Save &amp; set next step</SubmitButton>
        </form>
      </details>
    </div>
  );
}
