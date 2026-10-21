import { load, requireCtx } from "@/lib/auth/current";
import { ROLE_LABELS, ROLES } from "@/lib/auth/roles";
import { createUserAction, createWeightSetAction, resetPasswordAction, updateSettingsAction, updateUserAction } from "@/app/actions";
import { getSettingsView, listUsers, listWeightSets, recentAuditLog } from "@/server/admin";
import { listReference } from "@/server/crm";
import { SCORE_DIMENSIONS } from "@/domain/scoring";
import { STAGES, STAGE_LABELS } from "@/domain/pipeline";
import { Badge, Card, centsInput, Field, fmtDateTime, Hidden, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const ctx = await requireCtx();
  const [users, weightSets, settings, ref, log] = await load(Promise.all([
    listUsers(ctx), listWeightSets(ctx), getSettingsView(ctx), listReference(ctx.db), recentAuditLog(ctx, 60),
  ]));
  const active = weightSets.find((w) => w.active);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Administration" title="Settings" subtitle="Users & roles, scoring weights, economics and reference data (admin only)" />

      <Card title="Users & roles">
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>User</th><th>Role</th><th>Territory</th><th>Active</th><th></th><th>Reset password</th></tr></thead>
            <tbody>{users.map((u) => (
              <tr key={u.id}>
                <td>{u.full_name}<div className="text-xs text-slate-500">{u.email}</div></td>
                <td colSpan={4}>
                  <form action={updateUserAction} className="flex flex-wrap items-center gap-2">
                    <Hidden name="id" value={u.id} />
                    <select className="input w-48" name="role" defaultValue={u.role}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select>
                    <input className="input w-32" name="territory" defaultValue={u.territory ?? ""} placeholder="Territory" />
                    <label className="text-sm"><input type="checkbox" name="active" defaultChecked={u.active} /> active</label>
                    <SubmitButton className="btn">Save</SubmitButton>
                  </form>
                </td>
                <td>
                  <form action={resetPasswordAction} className="flex gap-2">
                    <Hidden name="id" value={u.id} />
                    <input className="input w-40" type="password" name="password" placeholder="New password (10+)" minLength={10} required autoComplete="new-password" />
                    <SubmitButton className="btn">Set</SubmitButton>
                  </form>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-brand-700">+ Invite user</summary>
          <form action={createUserAction} className="mt-2 grid gap-2 md:grid-cols-5">
            <input className="input" name="full_name" placeholder="Full name" required />
            <input className="input" type="email" name="email" placeholder="Email" required />
            <select className="input" name="role" defaultValue="SALES_REP">{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select>
            <input className="input" type="password" name="password" placeholder="Temporary password (10+)" minLength={10} required autoComplete="new-password" />
            <SubmitButton>Create</SubmitButton>
          </form>
        </details>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`Scoring weights (active: ${active?.version ?? "none"})`}>
          <p className="muted mb-2">New versions are appended and activated. Existing scores keep the weights they were calculated with.</p>
          <form action={createWeightSetAction} className="grid gap-2 sm:grid-cols-3">
            <Field label="New version"><input className="input" name="version" placeholder="v2" required /></Field>
            {SCORE_DIMENSIONS.map((d) => (
              <Field key={d.key} label={`${d.label}${d.inverse ? " (inv.)" : ""}`}>
                <input className="input" name={d.key} type="number" min={0} step="any" defaultValue={active?.weights[d.key] ?? 10} required />
              </Field>
            ))}
            <Field label="Why the change" className="sm:col-span-3"><input className="input" name="notes" /></Field>
            <div><SubmitButton>Create & activate</SubmitButton></div>
          </form>
          <ul className="mt-3 text-xs text-slate-600">{weightSets.map((w) => <li key={w.version}>{w.version} {w.active ? <Badge tone="green">active</Badge> : null} · {fmtDateTime(w.created_at)} · {w.notes}</li>)}</ul>
        </Card>

        <Card title="Economics & intake">
          <form action={updateSettingsAction} className="space-y-3">
            <Field label="Internal loaded hourly cost (USD) — used for gross margin" hint="Delivery cost = hours × this rate + direct costs">
              <input className="input" name="internal_hourly_cost__money" defaultValue={centsInput(Number(settings.internal_hourly_cost_cents ?? 4000))} required />
            </Field>
            <Field label="Default owner for ingested / referral leads">
              <select className="input" name="default_lead_owner_user_id" defaultValue={settings.default_lead_owner_user_id ?? ""}>
                <option value="">Unassigned (manager assigns)</option>
                {users.filter((u) => u.active && ["ADMIN_MANAGER", "SALES_REP"].includes(u.role)).map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </Field>
            <SubmitButton>Save</SubmitButton>
          </form>
          <div className="mt-4 grid gap-3 text-xs text-slate-600 sm:grid-cols-2">
            <div><div className="label">Pipeline stages (fixed)</div><ol className="ml-4 list-decimal">{STAGES.map((s) => <li key={s}>{STAGE_LABELS[s]}</li>)}</ol></div>
            <div>
              <div className="label">Verticals</div><ul>{ref.verticals.map((v) => <li key={v.code}>{v.name}{v.regulated ? " (regulated)" : ""}</li>)}</ul>
              <div className="label mt-2">Loss reasons</div><ul>{ref.lossReasons.map((v) => <li key={v.code}>{v.name}</li>)}</ul>
            </div>
          </div>
        </Card>
      </div>

      <Card title="Audit trail (latest 60 changes)">
        <div className="max-h-96 overflow-auto">
          <table className="table text-xs">
            <thead><tr><th>When</th><th>Actor</th><th>Entity</th><th>Action</th><th>Change</th></tr></thead>
            <tbody>{log.map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap">{fmtDateTime(l.created_at)}</td>
                <td>{l.actor_label ?? "system"}</td>
                <td>{l.entity_type}</td>
                <td>{l.action}</td>
                <td className="max-w-xl truncate font-mono" title={JSON.stringify(l.after_data)}>{l.before_data ? `${JSON.stringify(l.before_data).slice(0, 80)} → ` : ""}{JSON.stringify(l.after_data)?.slice(0, 160)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
