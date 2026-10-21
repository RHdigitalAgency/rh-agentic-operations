import { saveRoiAction } from "@/app/actions";
import type { RoiScenarioRow } from "@/server/audits";
import { Field, Hidden } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

const money = (a: Record<string, unknown> | undefined, k: string) => (a && typeof a[`${k}_cents`] === "number" ? ((a[`${k}_cents`] as number) / 100).toFixed(2) : "");
const num = (a: Record<string, unknown> | undefined, k: string) => (a && a[k] !== undefined && a[k] !== null ? String(a[k]) : "");

/** Editable ROI assumptions. Saving an existing scenario appends a new version; history is preserved. */
export function RoiForm({ auditId, scenario, processes }: { auditId: string; scenario?: RoiScenarioRow; processes: { id: string; name: string }[] }) {
  const a = scenario?.assumptions;
  const pct = (k: string, label: string) => (
    <Field label={label}>
      <div className="flex items-center gap-1">
        <input className="input" name={`${k}_low`} defaultValue={num(a, `${k}_low`)} inputMode="decimal" placeholder="low %" required />
        <span className="text-slate-400">–</span>
        <input className="input" name={`${k}_high`} defaultValue={num(a, `${k}_high`)} inputMode="decimal" placeholder="high %" required />
      </div>
    </Field>
  );
  return (
    <form action={saveRoiAction} className="space-y-3">
      <Hidden name="audit_id" value={auditId} />
      {scenario ? <Hidden name="scenario_key" value={scenario.scenario_key} /> : null}
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Scenario name"><input className="input" name="name" defaultValue={scenario?.name} required /></Field>
        <Field label="Process (optional)">
          <select className="input" name="process_id" defaultValue={scenario?.process_id ?? ""}>
            <option value="">— whole audit —</option>
            {processes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
      </div>
      <fieldset className="grid gap-3 md:grid-cols-4">
        <legend className="label col-span-full">Current labor</legend>
        <Field label="Hours / month"><input className="input" name="labor_hours_per_month" defaultValue={num(a, "labor_hours_per_month")} required /></Field>
        <Field label="Loaded hourly cost ($)"><input className="input" name="loaded_hourly_cost" defaultValue={money(a, "loaded_hourly_cost")} required /></Field>
        <Field label="People involved"><input className="input" name="people_involved" defaultValue={num(a, "people_involved")} /></Field>
        {pct("capacity_recovered_pct", "Capacity recovered % (low–high)")}
      </fieldset>
      <fieldset className="grid gap-3 md:grid-cols-4">
        <legend className="label col-span-full">Revenue leakage & quality cost</legend>
        <Field label="Leakage $ / month"><input className="input" name="leakage_monthly" defaultValue={money(a, "leakage_monthly")} /></Field>
        {pct("leakage_recovered_pct", "Leakage recovered % (low–high)")}
        <Field label="Quality cost $ / month"><input className="input" name="quality_cost_monthly" defaultValue={money(a, "quality_cost_monthly")} /></Field>
        {pct("quality_reduction_pct", "Quality cost reduced % (low–high)")}
      </fieldset>
      <fieldset className="grid gap-3 md:grid-cols-4">
        <legend className="label col-span-full">Future state & implementation</legend>
        <Field label="Agent/platform cost $ / month"><input className="input" name="platform_cost_monthly" defaultValue={money(a, "platform_cost_monthly")} /></Field>
        <Field label="Supervision hours / month"><input className="input" name="supervision_hours_per_month" defaultValue={num(a, "supervision_hours_per_month")} /></Field>
        <Field label="RH implementation fee ($)"><input className="input" name="rh_implementation_fee" defaultValue={money(a, "rh_implementation_fee")} /></Field>
        <Field label="Client setup cost ($)"><input className="input" name="client_setup_cost" defaultValue={money(a, "client_setup_cost")} /></Field>
      </fieldset>
      <Field label="Assumption notes / sources"><textarea className="input" name="notes" rows={2} defaultValue={num(a, "notes")} /></Field>
      <SubmitButton>{scenario ? `Save as version ${scenario.version + 1}` : "Create scenario"}</SubmitButton>
    </form>
  );
}
