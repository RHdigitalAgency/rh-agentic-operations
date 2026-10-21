import { notFound } from "next/navigation";
import { requireCtx } from "@/lib/auth/current";
import { can } from "@/lib/auth/user";
import { createLeadAction } from "@/app/actions";
import { listActiveUsers, listCompanies, listReference } from "@/server/crm";
import { Card, Field, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata = { title: "New lead" };

export default async function NewLeadPage() {
  const ctx = await requireCtx();
  if (!can(ctx.user, "crm.write")) notFound();
  const [ref, users, companies] = await Promise.all([listReference(ctx.db), listActiveUsers(ctx), listCompanies(ctx)]);
  const isSales = ctx.user.role === "SALES_REP";
  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow="Sales" title="New lead" subtitle="Manual entry. Instagram and website leads arrive automatically through the ingestion API." />
      <form action={createLeadAction} className="space-y-4">
        <Card title="Company">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Existing company" hint="Pick one, or fill in a new company below" className="md:col-span-2">
              <select className="input" name="company_id" defaultValue="">
                <option value="">— New company —</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="New company name"><input className="input" name="company_name" /></Field>
            <Field label="Vertical">
              <select className="input" name="vertical" defaultValue="">
                <option value="">—</option>
                {ref.verticals.map((v) => <option key={v.code} value={v.code}>{v.name}</option>)}
              </select>
            </Field>
            <Field label="Website"><input className="input" name="website" placeholder="example.com" /></Field>
            <Field label="City / Country">
              <div className="flex gap-2"><input className="input" name="city" placeholder="City" /><input className="input" name="country" placeholder="Country" /></div>
            </Field>
          </div>
        </Card>
        <Card title="Contact (optional)">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Name"><input className="input" name="contact_name" /></Field>
            <Field label="Role"><input className="input" name="role_title" /></Field>
            <Field label="Email"><input className="input" type="email" name="email" /></Field>
            <Field label="Phone"><input className="input" name="phone" /></Field>
            <Field label="Instagram handle"><input className="input" name="instagram_handle" placeholder="@handle" /></Field>
          </div>
        </Card>
        <Card title="Attribution">
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Source">
              <select className="input" name="source" defaultValue="outbound" required>
                {ref.sources.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Campaign"><input className="input" name="campaign" /></Field>
            <Field label="Content / post ID"><input className="input" name="content_id" /></Field>
            <Field label="Keyword"><input className="input" name="keyword" /></Field>
            <Field label="Referrer / partner"><input className="input" name="referrer" /></Field>
            <Field label="UTM (JSON)"><input className="input" name="utm" placeholder='{"utm_source":"..."}' /></Field>
          </div>
        </Card>
        <Card title="Opportunity">
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Title"><input className="input" name="title" placeholder="e.g. Lead response automation" /></Field>
            <Field label="Owner">
              <select className="input" name="owner_user_id" defaultValue={ctx.user.id} disabled={isSales}>
                {users.filter((u) => ["SALES_REP", "ADMIN_MANAGER"].includes(u.role)).map((u) => <option key={u.id} value={u.id}>{u.full_name ?? u.email}</option>)}
              </select>
            </Field>
            <Field label="Estimated value (USD)"><input className="input" name="estimated_value__money" inputMode="decimal" placeholder="5,000" /></Field>
            <Field label="Next action" className="md:col-span-2"><input className="input" name="next_action" placeholder="First outreach DM" required /></Field>
            <Field label="Next action due"><input className="input" type="datetime-local" name="next_action_at" required /></Field>
          </div>
        </Card>
        <SubmitButton>Create lead</SubmitButton>
      </form>
    </div>
  );
}
