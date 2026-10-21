import Link from "next/link";
import { load, requireCtx } from "@/lib/auth/current";
import { can } from "@/lib/auth/user";
import {
  addActivityAction, archiveOpportunityAction, completeFitCallAction, createProposalAction, offerAuditAction, scheduleFitCallAction,
  transitionStageAction, updateOpportunityAction,
} from "@/app/actions";
import { ACTIVITY_TYPES, getOpportunityDetail, listActiveUsers, listReference } from "@/server/crm";
import { allowedTargets, STAGE_LABELS, STAGES, type Stage } from "@/domain/pipeline";
import { Activity, BadgeDollarSign, ClipboardList, FileSignature, GitBranch, History, Megaphone, PhoneCall } from "lucide-react";
import { Badge, Card, centsInput, Empty, Field, fmtDate, fmtDateTime, Hidden, KV, Money, PageHeader, StageBadge, StatusBadge, Stepper, toLocalInput, type Step } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata = { title: "Opportunity" };

const TRACK: [Stage, string][] = [
  ["NEW_LEAD", "New lead"], ["CONTACTED", "Contacted"], ["FIT_CALL_BOOKED", "Fit call"], ["FIT_QUALIFIED", "Qualified"],
  ["AUDIT_OFFERED", "Audit offered"], ["AUDIT_PAID", "Audit paid"], ["AUDIT_IN_PROGRESS", "Discovery"], ["AUDIT_PRESENTED", "Presented"],
  ["PROPOSAL_SENT", "Proposal"], ["WON_DEPLOYMENT", "Won"],
];

/** Deal progress across the fixed pipeline, from the stage history (lost deals show where they stopped). */
function dealSteps(stage: Stage, history: { to_stage: string }[]): Step[] {
  const reached = Math.max(0, ...history.filter((h) => h.to_stage !== "LOST_NURTURE").map((h) => Math.min(STAGES.indexOf(h.to_stage as Stage), 9)));
  const won = stage === "WON_DEPLOYMENT" || stage === "WON_RETAINER";
  const lost = stage === "LOST_NURTURE";
  return TRACK.map(([code, label], i) => {
    if (won) return { label: i === 9 && stage === "WON_RETAINER" ? "Won · retainer" : label, state: "done" };
    if (lost) return { label: i === reached + 1 ? "Lost / nurture" : label, state: i <= reached ? "done" : i === reached + 1 ? "blocked" : "todo" };
    const cur = STAGES.indexOf(stage);
    return { label, state: i < cur ? "done" : code === stage ? "current" : "todo" };
  });
}

export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx();
  const { opp, fitCalls, history, audits, proposals, contacts, activities } = await load(getOpportunityDetail(ctx, id));
  const [ref, users] = await Promise.all([listReference(ctx.db), listActiveUsers(ctx)]);
  const canWrite = can(ctx.user, "crm.write");
  const targets = allowedTargets(opp.stage, { isManager: ctx.user.role === "ADMIN_MANAGER" });
  const backTo = `/opportunities/${id}`;
  const activeAudit = audits.find((a) => a.status !== "CANCELLED");
  const openFitCall = fitCalls.find((f) => !f.completed_at);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Opportunity"
        title={<>{opp.company_name} <StageBadge stage={opp.stage} /></>}
        subtitle={<>{opp.title ?? "Opportunity"} · <Link href={`/companies/${opp.company_id}`}>Account view →</Link></>}
        actions={ctx.user.role === "ADMIN_MANAGER" ? (
          <form action={archiveOpportunityAction}><Hidden name="id" value={id} /><SubmitButton className="btn btn-danger" confirm="Archive this opportunity? It will be hidden from pipeline and metrics.">Archive</SubmitButton></form>
        ) : null}
      />

      <Stepper steps={dealSteps(opp.stage, history)} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card icon={Megaphone} title="Attribution" className="lg:col-span-1">
          <KV items={[
            ["Source", opp.source],
            ["Campaign", opp.campaign],
            ["Content / post", opp.content_id],
            ["Keyword", opp.keyword ? <Badge tone="purple">{opp.keyword}</Badge> : null],
            ["Referrer", opp.referrer],
            ["UTM", Object.keys(opp.utm ?? {}).length ? <code className="text-xs">{JSON.stringify(opp.utm)}</code> : null],
            ["External event", opp.external_event_id],
            ["Created", fmtDateTime(opp.created_at)],
          ]} />
        </Card>

        <Card icon={GitBranch} title="Stage" className="lg:col-span-2">
          <p className="muted mb-3">
            In <b>{STAGE_LABELS[opp.stage]}</b> since {fmtDate(opp.stage_changed_at)}.
            {opp.stage === "LOST_NURTURE" ? ` Reason: ${ref.lossReasons.find((r) => r.code === opp.loss_reason)?.name ?? "—"}${opp.nurture_at ? ` · nurture on ${fmtDate(opp.nurture_at)}` : ""}${opp.loss_notes ? ` · ${opp.loss_notes}` : ""}` : ""}
          </p>
          {canWrite && targets.length ? (
            <form action={transitionStageAction} className="grid gap-3 md:grid-cols-4">
              <Hidden name="id" value={id} />
              <Field label="Move to">
                <select className="input" name="to" required defaultValue={targets[0]}>
                  {targets.map((t) => <option key={t} value={t}>{STAGE_LABELS[t]}</option>)}
                </select>
              </Field>
              <Field label="Loss reason (if lost)">
                <select className="input" name="loss_reason" defaultValue="">
                  <option value="">—</option>
                  {ref.lossReasons.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
                </select>
              </Field>
              <Field label="…or nurture date"><input className="input" type="date" name="nurture_at" /></Field>
              <div className="flex items-end"><SubmitButton>Move</SubmitButton></div>
              <Field label="Loss notes" className="md:col-span-4"><input className="input" name="loss_notes" /></Field>
            </form>
          ) : <p className="muted">No manual moves available.</p>}
          <p className="mt-2 text-xs text-slate-500">Audit, proposal and fit-call actions advance the stage automatically when their exit conditions are met.</p>
        </Card>
      </div>

      <Card icon={ClipboardList} title="Details & next action">
        <form action={updateOpportunityAction} className="grid gap-3 md:grid-cols-4">
          <Hidden name="id" value={id} />
          <Field label="Title"><input className="input" name="title" defaultValue={opp.title ?? ""} disabled={!canWrite} /></Field>
          <Field label="Owner">
            <select className="input" name="owner_user_id" defaultValue={opp.owner_user_id ?? ""} disabled={!canWrite || ctx.user.role === "SALES_REP"}>
              <option value="">Unassigned</option>
              {users.filter((u) => ["SALES_REP", "ADMIN_MANAGER", "EXTERNAL_REP"].includes(u.role)).map((u) => <option key={u.id} value={u.id}>{u.full_name ?? u.email}</option>)}
            </select>
          </Field>
          <Field label={`Estimated value (${opp.currency})`}><input className="input" name="estimated_value__money" defaultValue={centsInput(opp.estimated_value_cents)} disabled={!canWrite} /></Field>
          <Field label="Primary contact">
            <select className="input" name="primary_contact_id" defaultValue={opp.primary_contact_id ?? ""} disabled={!canWrite}>
              <option value="">—</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.name ?? c.email ?? c.instagram_handle}</option>)}
            </select>
          </Field>
          <Field label="Next action" className="md:col-span-2"><input className="input" name="next_action" defaultValue={opp.next_action ?? ""} disabled={!canWrite} /></Field>
          <Field label="Due"><input className="input" type="datetime-local" name="next_action_at" defaultValue={toLocalInput(opp.next_action_at)} disabled={!canWrite} /></Field>
          {canWrite ? <div className="flex items-end"><SubmitButton>Save</SubmitButton></div> : null}
        </form>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card icon={PhoneCall} title="Fit calls">
          {fitCalls.length === 0 ? <Empty>No fit call yet.</Empty> : (
            <ul className="space-y-3">
              {fitCalls.map((f) => (
                <li key={f.id} className="text-sm">
                  <div><b>{fmtDateTime(f.scheduled_at)}</b> {f.completed_at ? <StatusBadge status={f.outcome ?? "DONE"} /> : <Badge tone="amber">scheduled</Badge>} {f.audit_recommended ? <Badge tone="green">audit recommended</Badge> : null}</div>
                  {f.pain_summary ? <p className="mt-1 text-slate-600">{f.pain_summary}</p> : null}
                  {!f.completed_at && canWrite ? (
                    <form action={completeFitCallAction} className="mt-2 grid gap-2 rounded-md bg-slate-50 p-2 md:grid-cols-2">
                      <Hidden name="fit_call_id" value={f.id} /><Hidden name="_back" value={backTo} />
                      <Field label="Outcome">
                        <select className="input" name="outcome" defaultValue="QUALIFIED">
                          <option value="QUALIFIED">Qualified</option><option value="NOT_QUALIFIED">Not qualified</option><option value="NO_SHOW">No-show</option>
                        </select>
                      </Field>
                      <label className="flex items-end gap-2 text-sm"><input type="checkbox" name="audit_recommended" defaultChecked /> Paid audit recommended</label>
                      <Field label="Pain summary" className="md:col-span-2"><textarea className="input" name="pain_summary" rows={2} /></Field>
                      <div><SubmitButton>Record outcome</SubmitButton></div>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {canWrite && !openFitCall ? (
            <form action={scheduleFitCallAction} className="mt-3 flex flex-wrap items-end gap-2">
              <Hidden name="opportunity_id" value={id} />
              <Field label="Schedule 15-min fit call"><input className="input" type="datetime-local" name="scheduled_at" required /></Field>
              <SubmitButton className="btn">Schedule</SubmitButton>
            </form>
          ) : null}
        </Card>

        <Card icon={BadgeDollarSign} title="Paid audit">
          {audits.length ? (
            <ul className="space-y-1 text-sm">
              {audits.map((a) => (
                <li key={a.id}><Link href={`/audits/${a.id}`}>Audit</Link> <StatusBadge status={a.status} /> <Money cents={a.price_cents} currency={a.currency} /> {a.paid_at ? `· paid ${fmtDate(a.paid_at)}` : ""}</li>
              ))}
            </ul>
          ) : <Empty>No audit yet. Fit call may be free; consulting is not — the audit is paid from day one.</Empty>}
          {!activeAudit && can(ctx.user, "audit.sell") && opp.stage !== "LOST_NURTURE" ? (
            <form action={offerAuditAction} className="mt-3 grid gap-2 md:grid-cols-3">
              <Hidden name="opportunity_id" value={id} />
              <Field label={`Audit price (${opp.currency})`}><input className="input" name="price__money" placeholder="1,250" required /></Field>
              <Field label="Auditor">
                <select className="input" name="owner_user_id" defaultValue="">
                  <option value="">—</option>
                  {users.filter((u) => ["AUDITOR_ANALYST", "ADMIN_MANAGER"].includes(u.role)).map((u) => <option key={u.id} value={u.id}>{u.full_name ?? u.email}</option>)}
                </select>
              </Field>
              <div className="flex items-end"><SubmitButton>Offer audit</SubmitButton></div>
            </form>
          ) : null}
        </Card>
      </div>

      {can(ctx.user, "proposal.read") ? (
        <Card icon={FileSignature} title="Proposals">
          {proposals.length === 0 ? <Empty>No proposals. Pilot proposals are normally created from the audit&apos;s recommended pilot.</Empty> : (
            <table className="table">
              <thead><tr><th>Title</th><th>Type</th><th>Status</th><th className="text-right">Amount</th></tr></thead>
              <tbody>{proposals.map((p) => (
                <tr key={p.id}><td><Link href={`/proposals/${p.id}`}>{p.title}</Link></td><td>{p.proposal_type}</td><td><StatusBadge status={p.status} /></td><td className="text-right"><Money cents={p.amount_cents} currency={p.currency} /></td></tr>
              ))}</tbody>
            </table>
          )}
          {can(ctx.user, "proposal.write") && ["AUDIT_PRESENTED", "PROPOSAL_SENT", "WON_DEPLOYMENT", "WON_RETAINER"].includes(opp.stage) ? (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-brand-700">New proposal (deployment / retainer / starter)</summary>
              <form action={createProposalAction} className="mt-2 grid gap-2 md:grid-cols-4">
                <Hidden name="opportunity_id" value={id} /><Hidden name="_back" value={backTo} />
                {activeAudit ? <Hidden name="audit_id" value={activeAudit.id} /> : null}
                <Field label="Type">
                  <select className="input" name="proposal_type" defaultValue="RETAINER">
                    <option value="DEPLOYMENT">Full deployment</option><option value="RETAINER">Optimization retainer (monthly)</option><option value="SMB_STARTER">SMB starter</option><option value="PILOT">Pilot</option>
                  </select>
                </Field>
                <Field label="Title"><input className="input" name="title" required /></Field>
                <Field label={`Amount (${opp.currency}; monthly for retainer)`}><input className="input" name="amount__money" required /></Field>
                <div className="flex items-end"><SubmitButton>Create draft</SubmitButton></div>
                <Field label="Scope" className="md:col-span-4"><textarea className="input" name="scope_summary" rows={2} /></Field>
              </form>
            </details>
          ) : null}
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card icon={Activity} title="Activities">
          {can(ctx.user, "activity.write") ? (
            <form action={addActivityAction} className="mb-3 grid gap-2 md:grid-cols-4">
              <Hidden name="opportunity_id" value={id} /><Hidden name="_back" value={backTo} />
              <select className="input" name="activity_type" defaultValue="CALL">{ACTIVITY_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
              <input className="input md:col-span-2" name="notes" placeholder="Notes" />
              <SubmitButton className="btn">Log</SubmitButton>
            </form>
          ) : null}
          {activities.length === 0 ? <Empty>No activity yet.</Empty> : (
            <ul className="space-y-1.5 text-sm">
              {activities.map((a) => <li key={a.id}><Badge>{a.activity_type}</Badge> <span className="text-slate-500">{fmtDateTime(a.occurred_at)} · {a.owner_name ?? "system"}</span><div>{a.notes}</div></li>)}
            </ul>
          )}
        </Card>
        <Card icon={History} title="Stage history (audit trail)">
          <ol className="space-y-1 text-sm">
            {history.map((h, i) => (
              <li key={i}><span className="text-slate-500">{fmtDateTime(h.changed_at)}</span> · {h.from_stage ? `${STAGE_LABELS[h.from_stage as keyof typeof STAGE_LABELS]} → ` : ""}<b>{STAGE_LABELS[h.to_stage as keyof typeof STAGE_LABELS]}</b> <span className="text-slate-500">({h.changed_by_name ?? "system"})</span></li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  );
}
