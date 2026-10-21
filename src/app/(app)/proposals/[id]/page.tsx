import Link from "next/link";
import { load, requireCtx } from "@/lib/auth/current";
import { can } from "@/lib/auth/user";
import { proposalStatusAction, retainerStatusAction, updateProposalAction } from "@/app/actions";
import { getProposal } from "@/server/proposals";
import { listActiveUsers } from "@/server/crm";
import { Card, centsInput, Field, fmtDateTime, Hidden, KV, Money, PageHeader, StatusBadge } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx();
  const p = await load(getProposal(ctx, id));
  const users = await listActiveUsers(ctx);
  const canWrite = can(ctx.user, "proposal.write");
  const [retainer] = p.retainer_id
    ? await ctx.db.query<{ id: string; status: string; mrr_cents: number; currency: string }>("select id, status, mrr_cents, currency from retainers where id = $1", [p.retainer_id])
    : [];

  return (
    <div className="max-w-4xl space-y-4">
      <PageHeader
        title={<>{p.title} <StatusBadge status={p.status} /></>}
        subtitle={<>{p.proposal_type} · <Link href={`/companies/${p.company_id}`}>{p.company_name}</Link></>}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Commercial">
          <KV items={[
            ["Amount", <><Money cents={p.amount_cents} currency={p.currency} />{p.proposal_type === "RETAINER" ? " / month" : ""}</>],
            ["Opportunity", p.opportunity_id ? <Link href={`/opportunities/${p.opportunity_id}`}>Open</Link> : "—"],
            ["Audit", p.audit_id ? <Link href={`/audits/${p.audit_id}`}>Open</Link> : "—"],
            ["From recommended pilot", p.agentic_opportunity_id ? "Yes" : "No"],
            ["Sent", fmtDateTime(p.sent_at)],
            ["Decision", fmtDateTime(p.decision_at)],
            ["Deployment", p.deployment_id ? <Link href={`/deployments/${p.deployment_id}`}>Open deployment →</Link> : "—"],
            ["Retainer", retainer ? <><StatusBadge status={retainer.status} /> <Money cents={retainer.mrr_cents} currency={retainer.currency} />/mo</> : "—"],
          ]} />
        </Card>
        <Card title="Actions">
          {!canWrite ? <p className="muted">Read-only.</p> : (
            <div className="space-y-3">
              {p.status === "DRAFT" ? (
                <form action={proposalStatusAction}><Hidden name="id" value={id} /><Hidden name="op" value="send" /><SubmitButton>Mark as sent to client</SubmitButton></form>
              ) : null}
              {p.status === "SENT" ? (
                <>
                  <form action={proposalStatusAction} className="space-y-2 rounded-md bg-emerald-50 p-3">
                    <Hidden name="id" value={id} /><Hidden name="op" value="accept" />
                    {p.proposal_type !== "RETAINER" ? (
                      <Field label="Delivery owner">
                        <select className="input" name="delivery_owner_user_id" defaultValue="">
                          <option value="">Assign later</option>
                          {users.filter((u) => ["DELIVERY", "ADMIN_MANAGER"].includes(u.role)).map((u) => <option key={u.id} value={u.id}>{u.full_name ?? u.email}</option>)}
                        </select>
                      </Field>
                    ) : null}
                    <Field label="Start date"><input className="input" type="date" name="start_date" /></Field>
                    <SubmitButton>{p.proposal_type === "RETAINER" ? "Accept → start retainer" : "Accept → create deployment"}</SubmitButton>
                  </form>
                  <form action={proposalStatusAction}><Hidden name="id" value={id} /><Hidden name="op" value="reject" /><SubmitButton className="btn btn-danger" confirm="Record this proposal as rejected?">Client rejected</SubmitButton></form>
                </>
              ) : null}
              {["DRAFT", "SENT"].includes(p.status) ? (
                <form action={proposalStatusAction}><Hidden name="id" value={id} /><Hidden name="op" value="withdraw" /><SubmitButton className="btn" confirm="Withdraw this proposal?">Withdraw</SubmitButton></form>
              ) : null}
              {retainer ? (
                <form action={retainerStatusAction} className="flex items-end gap-2">
                  <Hidden name="id" value={retainer.id} /><Hidden name="_back" value={`/proposals/${id}`} />
                  <Field label="Retainer status">
                    <select className="input" name="status" defaultValue={retainer.status}><option>ACTIVE</option><option>PAUSED</option><option>CANCELLED</option></select>
                  </Field>
                  <SubmitButton className="btn">Update</SubmitButton>
                </form>
              ) : null}
            </div>
          )}
        </Card>
      </div>
      <Card title="Scope">
        {p.status === "DRAFT" && canWrite ? (
          <form action={updateProposalAction} className="space-y-3">
            <Hidden name="id" value={id} />
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Title"><input className="input" name="title" defaultValue={p.title} required /></Field>
              <Field label={`Amount (${p.currency})`}><input className="input" name="amount__money" defaultValue={centsInput(p.amount_cents)} required /></Field>
            </div>
            <Field label="Scope"><textarea className="input" name="scope_summary" rows={6} defaultValue={p.scope_summary ?? ""} /></Field>
            <SubmitButton>Save draft</SubmitButton>
          </form>
        ) : <p className="text-sm whitespace-pre-wrap">{p.scope_summary ?? "—"}</p>}
      </Card>
    </div>
  );
}
