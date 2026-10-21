import Link from "next/link";
import { notFound } from "next/navigation";
import { load, requireCtx } from "@/lib/auth/current";
import { can } from "@/lib/auth/user";
import { createAgenticOpportunityAction, scoreProcessAction, updateProcessAction } from "@/app/actions";
import { classificationLabel, getAuditWorkspace, getProcess, getProcessScoreHistory, recomputeStoredScore } from "@/server/audits";
import { riskFlags, SCORE_DIMENSIONS, calculateScore } from "@/domain/scoring";
import { Badge, Card, centsInput, Empty, Field, fmtDateTime, fmtNum, Hidden, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export default async function ProcessPage({ params }: { params: Promise<{ id: string; pid: string }> }) {
  const { id, pid } = await params;
  const ctx = await requireCtx();
  const { process, audit } = await load(getProcess(ctx, pid));
  if (audit.id !== id) notFound();
  const [history, ws] = await Promise.all([getProcessScoreHistory(ctx, pid), getAuditWorkspace(ctx, id)]);
  const latest = history[0];
  const canWrite = can(ctx.user, "audit.write") && audit.status !== "CANCELLED";
  const back = `/audits/${id}/processes/${pid}`;
  const breakdown = latest ? calculateScore(latest, latest.weights) : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title={<>{process.name} <Badge tone={process.classification === "AGENT_READY" ? "green" : "gray"}>{classificationLabel(process.classification)}</Badge></>}
        subtitle={<><Link href={`/audits/${id}`}>← Audit · {audit.company_name}</Link></>}
      />

      <Card title="Process capture">
        <form action={updateProcessAction}>
          <Hidden name="id" value={pid} /><Hidden name="_back" value={back} />
          <fieldset disabled={!canWrite} className="grid gap-3 md:grid-cols-4">
            <Field label="Name"><input className="input" name="name" defaultValue={process.name} required /></Field>
            <Field label="Process owner"><input className="input" name="process_owner" defaultValue={process.process_owner ?? ""} /></Field>
            <Field label="Frequency"><input className="input" name="frequency" defaultValue={process.frequency ?? ""} placeholder="daily, per lead…" /></Field>
            <Field label="Classification">
              <select className="input" name="classification" defaultValue={process.classification ?? ""}>
                <option value="">Unclassified</option><option value="HUMAN_ONLY">Human only</option><option value="AUTOMATE">Automate</option><option value="AGENT_READY">Agent-ready</option><option value="REDESIGN_FIRST">Redesign first</option>
              </select>
            </Field>
            <Field label="Monthly volume"><input className="input" name="monthly_volume" defaultValue={process.monthly_volume ?? ""} /></Field>
            <Field label="Monthly hours"><input className="input" name="monthly_hours" defaultValue={process.monthly_hours ?? ""} /></Field>
            <Field label="Loaded hourly cost ($)"><input className="input" name="loaded_hourly_cost__money" defaultValue={centsInput(process.loaded_hourly_cost_cents)} /></Field>
            <Field label="Human judgment level (1-5)"><input className="input" name="judgment_level" type="number" min={1} max={5} defaultValue={process.judgment_level ?? ""} /></Field>
            <Field label="Inputs"><textarea className="input" name="inputs" rows={2} defaultValue={process.inputs ?? ""} /></Field>
            <Field label="Outputs"><textarea className="input" name="outputs" rows={2} defaultValue={process.outputs ?? ""} /></Field>
            <Field label="Systems / tools (comma separated)"><textarea className="input" name="systems" rows={2} defaultValue={process.systems.join(", ")} /></Field>
            <Field label="Exceptions"><textarea className="input" name="exceptions" rows={2} defaultValue={process.exceptions ?? ""} /></Field>
            <Field label="Risk notes" className="md:col-span-2"><textarea className="input" name="risk_notes" rows={2} defaultValue={process.risk_notes ?? ""} /></Field>
            <Field label="Error consequence" className="md:col-span-2"><textarea className="input" name="error_consequence_notes" rows={2} defaultValue={process.error_consequence_notes ?? ""} /></Field>
          </fieldset>
          {canWrite ? <div className="mt-3"><SubmitButton>Save process</SubmitButton></div> : null}
        </form>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`Agentic Opportunity Score (active weights ${ws.weights.version})`}>
          <form action={scoreProcessAction}>
            <Hidden name="id" value={pid} /><Hidden name="_back" value={back} />
            <fieldset disabled={!canWrite} className="grid gap-2 sm:grid-cols-2">
              {SCORE_DIMENSIONS.map((d) => (
                <Field key={d.key} label={`${d.label}${d.inverse ? " (inverse)" : ""} · w${ws.weights.weights[d.key]}`}>
                  <select className="input" name={d.key} defaultValue={latest ? String(latest[d.key]) : "3"}>
                    {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </Field>
              ))}
            </fieldset>
            {canWrite ? <div className="mt-3"><SubmitButton>Calculate & save score</SubmitButton></div> : null}
          </form>
          <p className="mt-2 text-xs text-slate-500">Score ranks opportunities; it never overrides risk. Inverse dimensions reduce the score as they rise.</p>
        </Card>

        <Card title="Current score breakdown">
          {!latest || !breakdown ? <Empty>Not scored yet.</Empty> : (
            <>
              <div className="text-3xl font-semibold">{fmtNum(latest.calculated_score, 2)} <span className="text-sm font-normal text-slate-500">/ 100 · weights {latest.scoring_version}</span></div>
              {riskFlags(latest).map((f) => <div key={f} className="mt-1 text-sm text-amber-800">⚠ {f}</div>)}
              <table className="table mt-2">
                <thead><tr><th>Dimension</th><th className="text-right">Raw</th><th className="text-right">Weight</th><th className="text-right">Points</th></tr></thead>
                <tbody>{breakdown.components.map((c) => (
                  <tr key={c.key}><td>{SCORE_DIMENSIONS.find((d) => d.key === c.key)?.label}{c.inverse ? " (inv.)" : ""}</td><td className="text-right">{c.raw}</td><td className="text-right">{c.weight}</td><td className="text-right tabular-nums">{fmtNum(c.contribution, 2)}</td></tr>
                ))}</tbody>
              </table>
              <details className="mt-2">
                <summary className="cursor-pointer text-sm text-brand-700">Score history ({history.length})</summary>
                <ul className="mt-1 text-xs text-slate-600">{history.map((h) => (
                  <li key={h.id}>{fmtDateTime(h.created_at)} · {fmtNum(h.calculated_score, 2)} (weights {h.scoring_version}) · reproduces: {recomputeStoredScore(h) === Number(h.calculated_score) ? "✓" : "✗"}</li>
                ))}</ul>
              </details>
            </>
          )}
        </Card>
      </div>

      <Card title="Agentic opportunities for this process">
        {ws.agenticOpportunities.filter((a) => a.process_id === pid).length === 0 ? <Empty>None yet.</Empty> : (
          <ul className="space-y-1 text-sm">{ws.agenticOpportunities.filter((a) => a.process_id === pid).map((a) => (
            <li key={a.id}>{a.recommended_for_pilot ? <Badge tone="green">recommended pilot</Badge> : null} {a.proposed_responsibility}</li>
          ))}</ul>
        )}
        {canWrite && process.classification && process.classification !== "HUMAN_ONLY" ? (
          <form action={createAgenticOpportunityAction} className="mt-3 grid gap-2 md:grid-cols-3">
            <Hidden name="process_id" value={pid} /><Hidden name="_back" value={back} />
            <Field label="Proposed agent responsibility" className="md:col-span-3"><textarea className="input" name="proposed_responsibility" rows={2} required /></Field>
            <Field label="Expected benefit" className="md:col-span-2"><input className="input" name="expected_benefit" /></Field>
            <Field label="Linked ROI scenario">
              <select className="input" name="roi_scenario_id" defaultValue="">
                <option value="">—</option>
                {ws.roiScenarios.map((r) => <option key={r.id} value={r.id}>{r.name} v{r.version}</option>)}
              </select>
            </Field>
            <Field label="Risk"><select className="input" name="risk_level" defaultValue="MEDIUM"><option>LOW</option><option>MEDIUM</option><option>HIGH</option></select></Field>
            <Field label="Difficulty"><select className="input" name="difficulty_level" defaultValue="MEDIUM"><option>LOW</option><option>MEDIUM</option><option>HIGH</option></select></Field>
            <Field label="Priority"><select className="input" name="priority" defaultValue="P2"><option>P1</option><option>P2</option><option>P3</option></select></Field>
            {audit.regulated ? (
              <label className="flex items-start gap-2 rounded-md bg-amber-50 p-2 text-sm text-amber-900 md:col-span-3">
                <input type="checkbox" name="regulated_boundary_ack" required />
                I confirm this responsibility is administrative/operational only. It does not provide legal, clinical or other professional advice, diagnosis, strategy or regulated judgment; uncertainty escalates to an authorized human.
              </label>
            ) : null}
            <div><SubmitButton>Add opportunity</SubmitButton></div>
          </form>
        ) : process.classification === "HUMAN_ONLY" ? <p className="muted mt-2">Human-only processes stay with people.</p> : null}
      </Card>
    </div>
  );
}
