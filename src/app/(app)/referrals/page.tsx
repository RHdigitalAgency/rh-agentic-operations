import { load, requireCtx } from "@/lib/auth/current";
import { submitReferralAction } from "@/app/actions";
import { listMyReferrals, listReference } from "@/server/crm";
import { Card, Empty, Field, fmtDate, PageHeader, StageBadge } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata = { title: "My referrals" };

/** Partner / external rep surface: submit referrals and see only their status. */
export default async function ReferralsPage() {
  const ctx = await requireCtx();
  const [rows, ref] = await Promise.all([load(listMyReferrals(ctx)), listReference(ctx.db)]);
  return (
    <div className="max-w-4xl space-y-4">
      <PageHeader eyebrow="Partner" title="My referrals" subtitle="Opportunities attributed to you and their current status" />
      <Card title="Attributed opportunities">
        {rows.length === 0 ? <Empty>No referrals yet.</Empty> : (
          <table className="table">
            <thead><tr><th>Company</th><th>Status</th><th>Referred</th><th>Last change</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}><td>{r.company_name}</td><td><StageBadge stage={r.stage} /></td><td>{fmtDate(r.created_at)}</td><td>{fmtDate(r.stage_changed_at)}</td></tr>
            ))}</tbody>
          </table>
        )}
      </Card>
      <Card title="Submit a referral">
        <form action={submitReferralAction} className="grid gap-3 md:grid-cols-2">
          <Field label="Company name"><input className="input" name="company_name" required /></Field>
          <Field label="Vertical">
            <select className="input" name="vertical" defaultValue="">
              <option value="">—</option>
              {ref.verticals.map((v) => <option key={v.code} value={v.code}>{v.name}</option>)}
            </select>
          </Field>
          <Field label="Contact name"><input className="input" name="contact_name" /></Field>
          <Field label="Contact email"><input className="input" type="email" name="email" /></Field>
          <Field label="Contact phone"><input className="input" name="phone" /></Field>
          <Field label="Context (pain, volume, urgency)" className="md:col-span-2"><textarea className="input" name="notes" rows={3} /></Field>
          <div><SubmitButton>Submit referral</SubmitButton></div>
        </form>
      </Card>
    </div>
  );
}
