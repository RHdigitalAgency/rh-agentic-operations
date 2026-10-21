import Link from "next/link";
import { load, requireCtx } from "@/lib/auth/current";
import {
  addEffortAction, addKpiAction, addQaItemAction, deploymentStatusAction, saveAgentRoleAction, updateDeploymentAction, updateQaItemAction,
} from "@/app/actions";
import { DEPLOYMENT_STATUSES, getDeploymentWorkspace, type AgentRoleRow } from "@/server/deployments";
import { listActiveUsers } from "@/server/crm";
import { Badge, Card, Empty, Field, fmtDate, fmtNum, fmtPct, Hidden, Money, PageHeader, Stat, StatusBadge, Stepper, type Step } from "@/components/ui";
import { BarChart3, Bot, Clock, Coins, FileText, Gauge, ShieldCheck, Target, TestTube2, TrendingUp, TriangleAlert } from "lucide-react";
import { SubmitButton } from "@/components/SubmitButton";
import { formatCents } from "@/domain/money";

export const metadata = { title: "Deployment" };

function RoleForm({ deploymentId, role, template }: { deploymentId: string; role?: AgentRoleRow; template: string | null }) {
  return (
    <form action={saveAgentRoleAction} className="grid gap-2 md:grid-cols-2">
      <Hidden name="deployment_id" value={deploymentId} />
      {role ? <Hidden name="role_id" value={role.id} /> : null}
      <Field label="Role name"><input className="input" name="name" defaultValue={role?.name} required /></Field>
      <Field label="Owner (human)"><input className="input" name="owner_name" defaultValue={role?.owner_name ?? ""} /></Field>
      <Field label="Responsibility" className="md:col-span-2"><textarea className="input" name="responsibility" rows={2} defaultValue={role?.responsibility} required /></Field>
      <Field label="Allowed actions"><textarea className="input" name="allowed_actions" rows={3} defaultValue={role?.allowed_actions ?? ""} /></Field>
      <Field label="Prohibited actions" hint={template ? "Regulated vertical: must exclude professional judgment" : undefined}><textarea className="input" name="prohibited_actions" rows={3} defaultValue={role?.prohibited_actions ?? template ?? ""} /></Field>
      <Field label="Approval requirements / thresholds"><textarea className="input" name="approval_requirements" rows={2} defaultValue={role?.approval_requirements ?? ""} /></Field>
      <Field label="Escalation owner"><input className="input" name="escalation_owner" defaultValue={role?.escalation_owner ?? ""} /></Field>
      <Field label="Exception handling"><textarea className="input" name="exception_handling" rows={2} defaultValue={role?.exception_handling ?? ""} /></Field>
      <Field label="Tools / systems accessed (comma separated)"><input className="input" name="tools" defaultValue={role?.tools.join(", ") ?? ""} /></Field>
      <Field label="Credential / access method" hint="Describe the method only — never store credentials here"><input className="input" name="access_method" defaultValue={role?.access_method ?? ""} /></Field>
      <Field label="Logging / monitoring"><input className="input" name="logging_monitoring" defaultValue={role?.logging_monitoring ?? ""} /></Field>
      <Field label="Rollback / disable procedure"><input className="input" name="rollback_procedure" defaultValue={role?.rollback_procedure ?? ""} /></Field>
      <Field label="Agent platform (provider)" hint="Any vendor — stored as metadata only"><input className="input" name="provider" defaultValue={role?.provider ?? ""} /></Field>
      <Field label="Provider metadata (JSON)" className="md:col-span-2"><input className="input" name="provider_metadata" defaultValue={role && Object.keys(role.provider_metadata ?? {}).length ? JSON.stringify(role.provider_metadata) : ""} /></Field>
      <div><SubmitButton>{role ? "Save role" : "Add role"}</SubmitButton></div>
    </form>
  );
}

const FLOW = [["PLANNED", "Planned"], ["BUILD", "Build"], ["QA", "QA"], ["LAUNCHED", "Launched"], ["MONITORING", "Monitoring"], ["COMPLETED", "Completed"]] as const;

function deliverySteps(status: string, launchDate: string | null): Step[] {
  if (status === "CANCELLED") return FLOW.map(([, label]) => ({ label, state: "blocked" as const, hint: "cancelled" }));
  const cur = FLOW.findIndex(([code]) => code === status);
  return FLOW.map(([code, label], i) => ({
    label,
    state: status === "PAUSED" ? "todo" : i < cur || status === "COMPLETED" ? "done" : i === cur ? "current" : "todo",
    hint: code === "LAUNCHED" && launchDate ? fmtDate(launchDate) : status === "PAUSED" && i === 0 ? "paused" : undefined,
  }));
}

export default async function DeploymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx();
  const ws = await load(getDeploymentWorkspace(ctx, id));
  const users = await listActiveUsers(ctx);
  const d = ws.deployment;
  const cur = d.currency ?? "USD";
  const w = ws.canWrite;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Deployment"
        title={<>{d.name} <StatusBadge status={d.status} /></>}
        subtitle={<>
          <Link href={`/companies/${d.company_id}`}>{d.company_name}</Link>
          {d.proposal_id ? <> · <Link href={`/proposals/${d.proposal_id}`}>Proposal</Link></> : null}
          {d.regulated ? <> · <Badge tone="amber">regulated — admin/operational scope only</Badge></> : null}
          {" · "}<Link href={`/deployments/${id}/case-study`}>Case-study summary →</Link>
        </>}
        actions={w ? (
          <form action={deploymentStatusAction} className="flex items-end gap-2">
            <Hidden name="id" value={id} />
            <select className="input" name="status" defaultValue="">
              <option value="" disabled>Change status…</option>
              {DEPLOYMENT_STATUSES.filter((s) => s !== d.status).map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}
            </select>
            <SubmitButton>Update</SubmitButton>
          </form>
        ) : null}
      />

      <Stepper steps={deliverySteps(d.status, d.launch_date)} />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Stat icon={Coins} label="Contract value" value={ws.financials ? <Money cents={ws.financials.revenueCents} currency={cur} /> : "Restricted"} />
        <Stat icon={Clock} label="Hours" value={fmtNum(d.hours)} />
        <Stat icon={BarChart3} label="Delivery cost" value={ws.financials ? <Money cents={ws.financials.deliveryCostCents} currency={cur} /> : "Restricted"} hint={ws.financials ? `${formatCents(d.direct_cost_cents, cur)} direct + ${fmtNum(d.hours)} h × ${formatCents(ws.financials.internalHourlyCostCents, cur)}/h` : undefined} />
        <Stat icon={Gauge} label="Gross margin" value={ws.financials ? fmtPct(ws.financials.grossMargin) : "Restricted"} />
        <Stat accent icon={TrendingUp} label="Client ROI (measured)" value={ws.financials?.clientRoi ? `${fmtNum(ws.financials.clientRoi, 2)}×` : "—"} hint={ws.financials?.monthlyBenefitCents ? `${formatCents(ws.financials.monthlyBenefitCents, cur)}/mo measured benefit` : undefined} />
      </div>

      {ws.readiness.length && ["PLANNED", "BUILD", "QA"].includes(d.status) ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900">
          <div className="flex items-center gap-2 font-semibold"><TriangleAlert className="size-4" aria-hidden /> Before this deployment can launch</div>
          <ul className="mt-2 space-y-1">
            {ws.readiness.map((r) => (
              <li key={r} className="flex items-start gap-2"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden />{r}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <Card icon={Target} title="Scope, schedule & reusability">
        <form action={updateDeploymentAction}>
          <Hidden name="id" value={id} />
          <fieldset disabled={!w} className="grid gap-3 md:grid-cols-4">
            <Field label="Name" className="md:col-span-2"><input className="input" name="name" defaultValue={d.name} required /></Field>
            <Field label="Delivery owner">
              <select className="input" name="owner_user_id" defaultValue={d.owner_user_id ?? ""} disabled={ctx.user.role !== "ADMIN_MANAGER"}>
                <option value="">Unassigned</option>
                {users.filter((u) => ["DELIVERY", "ADMIN_MANAGER"].includes(u.role)).map((u) => <option key={u.id} value={u.id}>{u.full_name ?? u.email}</option>)}
              </select>
            </Field>
            <Field label="Launch version"><input className="input" name="launch_version" defaultValue={d.launch_version ?? ""} /></Field>
            <Field label="Scope — included" className="md:col-span-2"><textarea className="input" name="scope_included" rows={3} defaultValue={d.scope_included ?? ""} /></Field>
            <Field label="Scope — excluded" className="md:col-span-2"><textarea className="input" name="scope_excluded" rows={3} defaultValue={d.scope_excluded ?? ""} /></Field>
            <Field label="Integrations" className="md:col-span-2"><textarea className="input" name="integrations" rows={2} defaultValue={d.integrations ?? ""} /></Field>
            <Field label="Start"><input className="input" type="date" name="start_date" defaultValue={d.start_date ?? ""} /></Field>
            <Field label="End"><input className="input" type="date" name="end_date" defaultValue={d.end_date ?? ""} /></Field>
            <Field label="Monitoring until"><input className="input" type="date" name="monitoring_until" defaultValue={d.monitoring_until ?? ""} /></Field>
            <Field label="Launched"><input className="input" value={fmtDate(d.launch_date)} disabled readOnly /></Field>
            <Field label="Reusable components"><input className="input" type="number" min={0} name="reusable_components" defaultValue={d.reusable_components} /></Field>
            <Field label="Total components"><input className="input" type="number" min={0} name="total_components" defaultValue={d.total_components} /></Field>
            <Field label="Assets that became templates" className="md:col-span-4"><textarea className="input" name="reusable_assets_notes" rows={2} defaultValue={d.reusable_assets_notes ?? ""} /></Field>
            <input type="hidden" name="before_narrative" value={d.before_narrative ?? ""} />
            <input type="hidden" name="intervention_summary" value={d.intervention_summary ?? ""} />
            <input type="hidden" name="after_narrative" value={d.after_narrative ?? ""} />
            <input type="hidden" name="lessons" value={d.lessons ?? ""} />
            <input type="hidden" name="client_approval_status" value={d.client_approval_status} />
          </fieldset>
          {w ? <div className="mt-3"><SubmitButton>Save</SubmitButton></div> : null}
        </form>
      </Card>

      <Card icon={Bot} title="Agent roles & human controls">
        {ws.roles.length === 0 ? <Empty>No agent roles defined.</Empty> : (
          <div className="space-y-3">
            {ws.roles.map((r) => (
              <details key={r.id} className="rounded-md border border-slate-200 p-3">
                <summary className="cursor-pointer">
                  <b>{r.name}</b> — {r.responsibility}{" "}
                  {r.gaps.length ? <Badge tone="amber">missing: {r.gaps.join(", ")}</Badge> : <Badge tone="green"><ShieldCheck className="mr-1 size-3" aria-hidden />control model complete</Badge>}
                  {r.provider ? <> <Badge>{r.provider}</Badge></> : null}
                </summary>
                <div className="mt-2 grid gap-2 text-sm md:grid-cols-2">
                  <div><span className="label">Allowed</span><p className="whitespace-pre-wrap">{r.allowed_actions ?? "—"}</p></div>
                  <div><span className="label">Prohibited</span><p className="whitespace-pre-wrap">{r.prohibited_actions ?? "—"}</p></div>
                  <div><span className="label">Approvals</span><p>{r.approval_requirements ?? "—"}</p></div>
                  <div><span className="label">Escalation</span><p>{r.escalation_owner ?? "—"}</p></div>
                  <div><span className="label">Tools</span><p>{r.tools.join(", ") || "—"}</p></div>
                  <div><span className="label">Rollback</span><p>{r.rollback_procedure ?? "—"}</p></div>
                </div>
                {w ? <div className="mt-3 border-t border-slate-100 pt-3"><RoleForm deploymentId={id} role={r} template={ws.regulatedTemplate} /></div> : null}
              </details>
            ))}
          </div>
        )}
        {w ? (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm text-brand-700">+ Add agent role</summary>
            <div className="mt-2"><RoleForm deploymentId={id} template={ws.regulatedTemplate} /></div>
          </details>
        ) : null}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card icon={TestTube2} title="QA & rollback readiness">
          {ws.qa.length === 0 ? <Empty>No test cases.</Empty> : (
            <ul className="space-y-2">
              {ws.qa.map((q) => (
                <li key={q.id} className="text-sm">
                  <div>{q.description} <StatusBadge status={q.status} /> {q.rollback_ready ? <Badge tone="green">rollback ready</Badge> : null}</div>
                  {q.evidence_url ? <a className="text-xs" href={q.evidence_url} target="_blank" rel="noreferrer">evidence</a> : null}
                  {w ? (
                    <form action={updateQaItemAction} className="mt-1 flex flex-wrap items-center gap-2">
                      <Hidden name="id" value={q.id} /><Hidden name="deployment_id" value={id} />
                      <select className="input w-28" name="status" defaultValue={q.status}><option>PENDING</option><option>PASSED</option><option>FAILED</option></select>
                      <input className="input w-48" name="evidence_url" defaultValue={q.evidence_url ?? ""} placeholder="Evidence link" />
                      <label className="text-xs"><input type="checkbox" name="rollback_ready" defaultChecked={q.rollback_ready} /> rollback ready</label>
                      <SubmitButton className="btn">Update</SubmitButton>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {w ? (
            <form action={addQaItemAction} className="mt-3 flex flex-wrap items-end gap-2">
              <Hidden name="deployment_id" value={id} />
              <input className="input flex-1" name="description" placeholder="New test case" required />
              <label className="text-xs"><input type="checkbox" name="rollback_ready" /> rollback ready</label>
              <SubmitButton className="btn">Add</SubmitButton>
            </form>
          ) : null}
        </Card>

        <Card icon={Clock} title="Effort — hours & direct cost">
          {w ? (
            <form action={addEffortAction} className="mb-3 grid gap-2 md:grid-cols-5">
              <Hidden name="deployment_id" value={id} />
              <input className="input" type="date" name="work_date" />
              <input className="input" name="hours" placeholder="Hours" inputMode="decimal" />
              <input className="input" name="direct_cost__money" placeholder={`Direct cost ${cur}`} />
              <input className="input" name="description" placeholder="What" />
              <SubmitButton className="btn">Log</SubmitButton>
            </form>
          ) : null}
          {ws.effort.length === 0 ? <Empty>No effort logged.</Empty> : (
            <table className="table">
              <thead><tr><th>Date</th><th className="text-right">Hours</th><th className="text-right">Direct cost</th><th>Description</th></tr></thead>
              <tbody>{ws.effort.map((e) => (
                <tr key={e.id}><td>{fmtDate(e.work_date)}</td><td className="text-right">{fmtNum(e.hours)}</td><td className="text-right">{ws.financials ? <Money cents={e.direct_cost_cents} currency={cur} /> : "—"}</td><td>{e.description} <span className="text-xs text-slate-500">{e.user_name}</span></td></tr>
              ))}</tbody>
            </table>
          )}
        </Card>
      </div>

      <Card icon={TrendingUp} title="Performance — baseline vs target vs result">
        {ws.comparison.length === 0 ? <Empty>Capture a baseline before launch so ROI can be demonstrated afterwards.</Empty> : (
          <table className="table">
            <thead><tr><th>Metric</th><th className="text-right">Baseline</th><th className="text-right">Target</th><th className="text-right">Latest result</th><th className="text-right">Change</th><th>Result window</th></tr></thead>
            <tbody>{ws.comparison.map((c) => (
              <tr key={c.metric_key}>
                <td>{c.metric_key} <span className="text-xs text-slate-500">({c.unit})</span></td>
                <td className="text-right tabular-nums">{fmtNum(c.baseline?.value)}</td>
                <td className="text-right tabular-nums">{fmtNum(c.target?.value)}</td>
                <td className="text-right font-medium tabular-nums">{fmtNum(c.latestResult?.value)}</td>
                <td className="text-right tabular-nums">{c.deltaPct !== null ? fmtPct(c.deltaPct) : "—"}</td>
                <td>{c.latestResult ? `${fmtDate(c.latestResult.window_start)} – ${fmtDate(c.latestResult.window_end)}` : "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
        {w ? (
          <form action={addKpiAction} className="mt-3 grid gap-2 md:grid-cols-8">
            <Hidden name="deployment_id" value={id} />
            <input className="input md:col-span-2" name="metric_key" placeholder="metric_key e.g. lead_response_minutes" required />
            <input className="input" name="unit" placeholder="unit" required />
            <select className="input" name="measurement_type" defaultValue="BASELINE"><option>BASELINE</option><option>TARGET</option><option>RESULT</option></select>
            <input className="input" name="value" placeholder="value" required />
            <input className="input" type="date" name="window_start" title="Window start" />
            <input className="input" type="date" name="window_end" title="Window end" />
            <input className="input" name="benefit_monthly__money" placeholder="$ benefit/mo (result)" />
            <input className="input md:col-span-6" name="notes" placeholder="Notes / data source" />
            <div className="md:col-span-2"><SubmitButton className="btn">Save measurement</SubmitButton></div>
          </form>
        ) : null}
      </Card>

      <Card icon={FileText} title="Case-study narrative">
        <form action={updateDeploymentAction}>
          <Hidden name="id" value={id} /><Hidden name="_back" value={`/deployments/${id}`} />
          {(["name", "scope_included", "scope_excluded", "integrations", "start_date", "end_date", "launch_version", "monitoring_until", "reusable_assets_notes"] as const).map((k) => (
            <input key={k} type="hidden" name={k} value={(d[k] as string | null) ?? ""} />
          ))}
          <input type="hidden" name="reusable_components" value={d.reusable_components} />
          <input type="hidden" name="total_components" value={d.total_components} />
          <fieldset disabled={!w} className="grid gap-3 md:grid-cols-2">
            <Field label="Before — who did the work, hours, delays, failure points"><textarea className="input" name="before_narrative" rows={3} defaultValue={d.before_narrative ?? ""} /></Field>
            <Field label="Intervention — redesign, agent responsibilities, controls"><textarea className="input" name="intervention_summary" rows={3} defaultValue={d.intervention_summary ?? ""} /></Field>
            <Field label="After — what now runs continuously"><textarea className="input" name="after_narrative" rows={3} defaultValue={d.after_narrative ?? ""} /></Field>
            <Field label="Lesson — what became reusable"><textarea className="input" name="lessons" rows={3} defaultValue={d.lessons ?? ""} /></Field>
            <Field label="Client approval for public use">
              <select className="input" name="client_approval_status" defaultValue={d.client_approval_status}>
                <option value="NOT_REQUESTED">Not requested</option><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="DENIED">Denied</option>
              </select>
            </Field>
          </fieldset>
          {w ? <div className="mt-3"><SubmitButton>Save narrative</SubmitButton></div> : null}
        </form>
      </Card>
    </div>
  );
}
