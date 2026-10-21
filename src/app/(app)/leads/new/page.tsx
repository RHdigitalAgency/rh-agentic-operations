import { notFound } from "next/navigation";
import { requireCtx } from "@/lib/auth/current";
import { can } from "@/lib/auth/user";
import { createLeadAction } from "@/app/actions";
import { listActiveUsers, listCompanies, listReference } from "@/server/crm";
import { Card, Field, PageHeader, toLocalInput } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata = { title: "New lead" };

/** Tomorrow at 09:00 server-local time: the default first-outreach deadline. */
function tomorrowNine(now: Date) {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

export default async function NewLeadPage() {
  const ctx = await requireCtx();
  if (!can(ctx.user, "crm.write")) notFound();
  const [ref, users, companies] = await Promise.all([listReference(ctx.db), listActiveUsers(ctx), listCompanies(ctx)]);
  const isSales = ctx.user.role === "SALES_REP";
  const due = toLocalInput(tomorrowNine(new Date()));
  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow="Sales" title="New lead" subtitle="Only the essentials are needed. Instagram and website leads arrive automatically." />
      <form action={createLeadAction} className="space-y-4">
        <Card title="Who">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Company" hint="Pick an existing account from the suggestions, or type a new name. Leave empty for an individual." className="md:col-span-2">
              <input className="input" name="company_name" list="company-names" autoComplete="off" autoFocus placeholder="e.g. Sunshine Roofing & Repair" />
              <datalist id="company-names">
                {companies.map((c) => <option key={c.id} value={c.name} />)}
              </datalist>
            </Field>
            <Field label="Contact name"><input className="input" name="contact_name" autoComplete="off" /></Field>
            <Field label="Instagram handle"><input className="input" name="instagram_handle" placeholder="@handle" autoComplete="off" /></Field>
            <Field label="Email"><input className="input" type="email" name="email" autoComplete="off" /></Field>
            <Field label="Phone"><input className="input" type="tel" name="phone" autoComplete="off" /></Field>
          </div>
        </Card>

        <Card title="Source & next step">
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Source">
              <select className="input" name="source" defaultValue="instagram_organic" required>
                {ref.sources.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Owner">
              <select className="input" name="owner_user_id" defaultValue={ctx.user.id} disabled={isSales}>
                {users.filter((u) => ["SALES_REP", "ADMIN_MANAGER"].includes(u.role)).map((u) => <option key={u.id} value={u.id}>{u.full_name ?? u.email}</option>)}
              </select>
            </Field>
            <Field label="Vertical">
              <select className="input" name="vertical" defaultValue="">
                <option value="">Not sure yet</option>
                {ref.verticals.map((v) => <option key={v.code} value={v.code}>{v.name}</option>)}
              </select>
            </Field>
            <Field label="Next action" className="md:col-span-2"><input className="input" name="next_action" defaultValue="First outreach" required /></Field>
            <Field label="Due"><input className="input" type="datetime-local" name="next_action_at" defaultValue={due} required /></Field>
          </div>
        </Card>

        <details className="card p-0">
          <summary className="cursor-pointer px-5 py-4 text-sm font-medium text-rh">More details (optional): campaign, keyword, value, website…</summary>
          <div className="grid gap-3 border-t border-frost px-5 py-4 md:grid-cols-3">
            <Field label="Campaign"><input className="input" name="campaign" /></Field>
            <Field label="Post / content ID"><input className="input" name="content_id" /></Field>
            <Field label="Keyword"><input className="input" name="keyword" placeholder="e.g. AGENTES" /></Field>
            <Field label="Referred by"><input className="input" name="referrer" /></Field>
            <Field label="Estimated value (USD)"><input className="input" name="estimated_value__money" inputMode="decimal" placeholder="5,000" /></Field>
            <Field label="Opportunity title"><input className="input" name="title" placeholder="e.g. Lead response automation" /></Field>
            <Field label="Contact role"><input className="input" name="role_title" /></Field>
            <Field label="Website"><input className="input" name="website" placeholder="example.com" /></Field>
            <Field label="City / Country">
              <div className="flex gap-2"><input className="input" name="city" placeholder="City" /><input className="input" name="country" placeholder="Country" /></div>
            </Field>
            <Field label="UTM (JSON)" className="md:col-span-3"><input className="input" name="utm" placeholder='{"utm_source":"google","utm_campaign":"audit"}' /></Field>
          </div>
        </details>

        <div className="flex flex-wrap gap-2">
          <SubmitButton className="btn btn-cta">Create lead</SubmitButton>
          <SubmitButton className="btn" name="then" value="another">Create & add another</SubmitButton>
        </div>
      </form>
    </div>
  );
}
