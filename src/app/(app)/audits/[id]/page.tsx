import Link from "next/link";
import { load, requireCtx } from "@/lib/auth/current";
import { can } from "@/lib/auth/user";
import {
  addProcessAction, cancelAuditAction, confirmAuditPaymentAction, createAuditCheckoutAction, createProposalFromPilotAction, presentAuditAction, setRecommendedPilotAction,
  startAuditAction, updateAuditDiscoveryAction,
} from "@/app/actions";
import { classificationLabel, getAuditWorkspace } from "@/server/audits";
import { listActiveUsers } from "@/server/crm";
import { stripeConfigured } from "@/server/stripe";
import { formatCents } from "@/domain/money";
import { Badge, Card, Empty, Field, fmtDate, fmtDateTime, fmtNum, fmtPct, Hidden, KV, Money, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { RoiForm } from "../RoiForm";

const CLASS_TONE = { AGENT_READY: "green", AUTOMATE: "blue", REDESIGN_FIRST: "amber", HUMAN_ONLY: "gray" } as const;

export default async function AuditWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx();
  const ws = await load(getAuditWorkspace(ctx, id));
  const users = await listActiveUsers(ctx);
  const { audit } = ws;
  const canWrite = can(ctx.user, "audit.write") && audit.status !== "CANCELLED";
  const back = `/audits/${id}`;
  const pilot = ws.agenticOpportunities.find((a) => a.recommended_for_pilot);
  const cur = audit.currency;
  const stripeOn = stripeConfigured();

  return (
    <div className="space-y-4">
      <PageHeader
        title={<>Audit · {audit.company_name} <StatusBadge status={audit.status} /></>}
        subtitle={<>
          <Link href={`/companies/${audit.company_id}`}>Account</Link>
          {audit.opportunity_id ? <> · <Link href={`/opportunities/${audit.opportunity_id}`}>Opportunity</Link></> : null}
          {audit.regulated ? <> · <Badge tone="amber">regulated vertical — administrative/operational scope only</Badge></> : null}
        </>}
        actions={<>
          {audit.status === "PAID" && canWrite ? <form action={startAuditAction}><Hidden name="id" value={id} /><SubmitButton>Start discovery</SubmitButton></form> : null}
          {audit.status === "IN_PROGRESS" && canWrite ? (
            <form action={presentAuditAction} className="flex items-end gap-2">
              <Hidden name="id" value={id} />
              <input className="input w-56" name="deliverable_url" placeholder="Deliverable link (optional)" defaultValue={audit.deliverable_url ?? ""} />
              <SubmitButton>Mark presented</SubmitButton>
            </form>
          ) : null}
          {ctx.user.role === "ADMIN_MANAGER" && audit.status !== "CANCELLED" && audit.status !== "PRESENTED" ? (
            <form action={cancelAuditAction}><Hidden name="id" value={id} /><SubmitButton className="btn btn-danger" confirm="Cancel this audit?">Cancel</SubmitButton></form>
          ) : null}
        </>}
      />

      {audit.status === "OFFERED" && can(ctx.user, "audit.sell") ? (
        <Card title={`Collect audit payment · ${formatCents(audit.price_cents, cur)}`}>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-medium">Manual confirmation <span className="font-normal text-slate-500">— any client (transfer, Yape, Zelle, card terminal…)</span></h3>
              <form action={confirmAuditPaymentAction} className="mt-2 flex flex-wrap items-end gap-2">
                <Hidden name="id" value={id} />
                <input className="input w-56" name="payment_reference" placeholder="Payment reference (optional)" />
                <SubmitButton>Confirm payment received</SubmitButton>
              </form>
            </div>
            <div>
              <h3 className="text-sm font-medium">Stripe payment link <span className="font-normal text-slate-500">— US clients, card payment</span></h3>
              {!stripeOn ? (
                <p className="muted mt-2">Stripe is not configured on this environment.</p>
              ) : audit.stripe_checkout_url && audit.stripe_checkout_expires_at && new Date(audit.stripe_checkout_expires_at) > new Date() ? (
                <div className="mt-2 space-y-1">
                  <input className="input font-mono text-xs" readOnly value={audit.stripe_checkout_url} aria-label="Stripe payment link" />
                  <p className="text-xs text-slate-500">Send this link to the client. It expires {fmtDateTime(audit.stripe_checkout_expires_at)}; the audit is marked paid automatically when they pay.</p>
                </div>
              ) : (
                <form action={createAuditCheckoutAction} className="mt-2">
                  <Hidden name="id" value={id} />
                  <SubmitButton className="btn">Create Stripe payment link</SubmitButton>
                  <p className="mt-1 text-xs text-slate-500">Valid 24 hours. Payment is confirmed automatically.</p>
                </form>
              )}
            </div>
          </div>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Price" value={formatCents(audit.price_cents, cur)} hint={audit.paid_at ? `paid ${fmtDate(audit.paid_at)}` : "not paid"} />
        <Stat label="Processes" value={ws.processes.length} hint={`${ws.classificationCounts.AGENT_READY} agent-ready`} />
        <Stat label="Overall score" value={fmtNum(ws.overallScore)} hint={`weights ${ws.weights.version}`} />
        <Stat label="Recommended pilot" value={pilot ? "Selected" : "—"} hint={pilot?.process_name} />
        <Stat label="Presented" value={fmtDate(audit.presentation_at)} hint={audit.deliverable_url ? <a href={audit.deliverable_url} target="_blank" rel="noreferrer">deliverable</a> : undefined} />
      </div>

      <Card title="1 · Discovery — goals, team, systems">
        <form action={updateAuditDiscoveryAction}>
          <Hidden name="id" value={id} />
          <fieldset disabled={!canWrite} className="grid gap-3 md:grid-cols-3">
            <Field label="Business goals"><textarea className="input" name="business_goals" rows={3} defaultValue={audit.business_goals ?? ""} /></Field>
            <Field label="Team"><textarea className="input" name="team_summary" rows={3} defaultValue={audit.team_summary ?? ""} /></Field>
            <Field label="Systems"><textarea className="input" name="systems_summary" rows={3} defaultValue={audit.systems_summary ?? ""} /></Field>
            <Field label="Executive summary" className="md:col-span-2"><textarea className="input" name="executive_summary" rows={3} defaultValue={audit.executive_summary ?? ""} /></Field>
            <Field label="Auditor">
              <select className="input" name="owner_user_id" defaultValue={audit.owner_user_id ?? ""}>
                <option value="">—</option>
                {users.filter((u) => ["AUDITOR_ANALYST", "ADMIN_MANAGER"].includes(u.role)).map((u) => <option key={u.id} value={u.id}>{u.full_name ?? u.email}</option>)}
              </select>
            </Field>
            <Field label="90-day roadmap" className="md:col-span-2"><textarea className="input" name="roadmap_90_day" rows={3} defaultValue={audit.roadmap_90_day ?? ""} /></Field>
            <Field label="Deliverable link"><input className="input" name="deliverable_url" defaultValue={audit.deliverable_url ?? ""} /></Field>
          </fieldset>
          {canWrite ? <div className="mt-3"><SubmitButton>Save discovery</SubmitButton></div> : null}
        </form>
      </Card>

      <Card title="2 · Process inventory, classification & score">
        {ws.processes.length === 0 ? <Empty>No processes mapped yet.</Empty> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Process</th><th>Classification</th><th className="text-right">Volume/mo</th><th className="text-right">Hours/mo</th><th className="text-right">Score</th><th>Risk</th></tr></thead>
              <tbody>{ws.processes.map((p) => (
                <tr key={p.id}>
                  <td><Link href={`/audits/${id}/processes/${p.id}`}>{p.name}</Link><div className="text-xs text-slate-500">{p.process_owner ?? ""}{p.systems.length ? ` · ${p.systems.join(", ")}` : ""}</div></td>
                  <td>{p.classification ? <Badge tone={CLASS_TONE[p.classification]}>{classificationLabel(p.classification)}</Badge> : <Badge tone="red">unclassified</Badge>}</td>
                  <td className="text-right tabular-nums">{fmtNum(p.monthly_volume, 0)}</td>
                  <td className="text-right tabular-nums">{fmtNum(p.monthly_hours)}</td>
                  <td className="text-right font-medium tabular-nums">{p.score ? fmtNum(p.score.calculated_score) : <span className="text-amber-700">not scored</span>}</td>
                  <td className="text-xs text-amber-800">{p.riskFlags.join("; ")}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {canWrite ? (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm text-brand-700">+ Add process</summary>
            <form action={addProcessAction} className="mt-2 grid gap-2 md:grid-cols-4">
              <Hidden name="audit_id" value={id} />
              <Field label="Process name"><input className="input" name="name" required /></Field>
              <Field label="Owner"><input className="input" name="process_owner" /></Field>
              <Field label="Monthly volume"><input className="input" name="monthly_volume" /></Field>
              <Field label="Monthly hours"><input className="input" name="monthly_hours" /></Field>
              <Field label="Classification">
                <select className="input" name="classification" defaultValue="">
                  <option value="">Decide later</option><option value="HUMAN_ONLY">Human only</option><option value="AUTOMATE">Automate</option><option value="AGENT_READY">Agent-ready</option><option value="REDESIGN_FIRST">Redesign first</option>
                </select>
              </Field>
              <div className="flex items-end"><SubmitButton>Add & open</SubmitButton></div>
            </form>
          </details>
        ) : null}
      </Card>

      <Card title="3 · Agentic opportunities & recommended pilot">
        {ws.agenticOpportunities.length === 0 ? <Empty>Define agentic opportunities from classified processes (open a process).</Empty> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Responsibility</th><th>Process</th><th className="text-right">Score</th><th>Risk / difficulty</th><th>Priority</th><th></th></tr></thead>
              <tbody>{ws.agenticOpportunities.map((a) => {
                const roi = ws.roiScenarios.find((r) => ws.roiVersions.some((v) => v.id === a.roi_scenario_id && v.scenario_key === r.scenario_key));
                const proposal = ws.proposals.find((pr) => pr.agentic_opportunity_id === a.id && pr.status !== "WITHDRAWN");
                return (
                  <tr key={a.id} className={a.recommended_for_pilot ? "bg-emerald-50/60" : ""}>
                    <td className="max-w-md">
                      {a.recommended_for_pilot ? <Badge tone="green">recommended pilot</Badge> : null} {a.proposed_responsibility}
                      {a.expected_benefit ? <div className="text-xs text-slate-500">Benefit: {a.expected_benefit}</div> : null}
                      {roi ? <div className="text-xs text-slate-500">ROI: {formatCents(roi.monthly_value_low_cents, cur)}–{formatCents(roi.monthly_value_high_cents, cur)}/mo ({roi.name} v{roi.version})</div> : null}
                    </td>
                    <td>{a.process_name} <div className="text-xs text-slate-500">{classificationLabel(a.classification)}</div></td>
                    <td className="text-right tabular-nums">{fmtNum(a.latest_score)}</td>
                    <td>{a.risk_level ?? "—"} / {a.difficulty_level ?? "—"}</td>
                    <td>{a.priority ?? "—"}</td>
                    <td className="space-y-1">
                      {canWrite && !a.recommended_for_pilot && a.classification === "AGENT_READY" ? (
                        <form action={setRecommendedPilotAction}><Hidden name="id" value={a.id} /><Hidden name="_back" value={back} /><SubmitButton className="btn">Recommend as pilot</SubmitButton></form>
                      ) : null}
                      {proposal ? <Link href={`/proposals/${proposal.id}`}>Proposal ({proposal.status.toLowerCase()}) →</Link> : null}
                      {a.recommended_for_pilot && !proposal && can(ctx.user, "proposal.write") && ["IN_PROGRESS", "PRESENTED"].includes(audit.status) ? (
                        <form action={createProposalFromPilotAction} className="flex items-end gap-1">
                          <Hidden name="agentic_opportunity_id" value={a.id} /><Hidden name="_back" value={back} />
                          <input className="input w-28" name="amount__money" placeholder={`Pilot ${cur}`} required />
                          <SubmitButton>Create proposal</SubmitButton>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="4 · ROI scenarios (estimates — not guarantees)">
        {ws.roiScenarios.length === 0 ? <Empty>No ROI scenario yet.</Empty> : (
          <div className="space-y-4">
            {ws.roiScenarios.map((r) => {
              const versions = ws.roiVersions.filter((v) => v.scenario_key === r.scenario_key);
              return (
                <div key={r.scenario_key} className="rounded-md border border-slate-200 p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-medium">{r.name} <span className="text-xs text-slate-500">v{r.version} · {r.model_version}</span></h3>
                    <span className="text-xs text-slate-500">by {r.created_by_name ?? "—"} · {fmtDateTime(r.created_at)}</span>
                  </div>
                  <div className="mt-2">
                    <KV items={[
                      ["Monthly value", <><Money cents={r.monthly_value_low_cents} currency={cur} /> – <Money cents={r.monthly_value_high_cents} currency={cur} /></>],
                      ["Annualized", <><Money cents={r.annual_value_low_cents} currency={cur} /> – <Money cents={r.annual_value_high_cents} currency={cur} /></>],
                      ["Implementation", <Money key="i" cents={r.implementation_cost_cents} currency={cur} />],
                      ["Payback", `${r.payback_months_low ?? "n/a"} – ${r.payback_months_high ?? "n/a"} months`],
                      ["First-year ROI", `${fmtPct(r.roi_low)} – ${fmtPct(r.roi_high)}`],
                    ]} />
                  </div>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm text-brand-700">Assumptions & history ({versions.length} version{versions.length > 1 ? "s" : ""})</summary>
                    <ul className="mt-1 text-xs text-slate-600">
                      {versions.map((v) => <li key={v.id}>v{v.version} · {fmtDateTime(v.created_at)} · {formatCents(v.monthly_value_low_cents, cur)}–{formatCents(v.monthly_value_high_cents, cur)}/mo · <code>{JSON.stringify(v.assumptions)}</code></li>)}
                    </ul>
                    {canWrite ? <div className="mt-3"><RoiForm auditId={id} scenario={r} processes={ws.processes} /></div> : null}
                  </details>
                </div>
              );
            })}
          </div>
        )}
        {canWrite ? (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm text-brand-700">+ New ROI scenario</summary>
            <div className="mt-2"><RoiForm auditId={id} processes={ws.processes} /></div>
          </details>
        ) : null}
      </Card>
    </div>
  );
}
