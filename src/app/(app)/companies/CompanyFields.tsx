import type { CompanyRow } from "@/server/crm";
import { Field } from "@/components/ui";

export function CompanyFields({ company, verticals, sources, disabled }: {
  company?: CompanyRow;
  verticals: { code: string; name: string }[];
  sources: { code: string; name: string }[];
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="grid gap-3 md:grid-cols-3">
      <Field label="Name"><input className="input" name="name" defaultValue={company?.name} required /></Field>
      <Field label="Website"><input className="input" name="website" defaultValue={company?.website ?? ""} /></Field>
      <Field label="Vertical">
        <select className="input" name="vertical" defaultValue={company?.vertical ?? ""}>
          <option value="">—</option>
          {verticals.map((v) => <option key={v.code} value={v.code}>{v.name}</option>)}
        </select>
      </Field>
      <Field label="City"><input className="input" name="city" defaultValue={company?.city ?? ""} /></Field>
      <Field label="Country"><input className="input" name="country" defaultValue={company?.country ?? ""} /></Field>
      <Field label="Source">
        <select className="input" name="source" defaultValue={company?.source ?? ""}>
          <option value="">—</option>
          {sources.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
        </select>
      </Field>
      <Field label="Employee band"><input className="input" name="employee_band" defaultValue={company?.employee_band ?? ""} placeholder="e.g. 10-49" /></Field>
      <Field label="Revenue band"><input className="input" name="revenue_band" defaultValue={company?.revenue_band ?? ""} placeholder="e.g. $1-5M" /></Field>
    </fieldset>
  );
}
