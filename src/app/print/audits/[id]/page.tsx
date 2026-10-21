import { load, requireCtx } from "@/lib/auth/current";
import { classificationLabel, getAuditWorkspace } from "@/server/audits";
import { formatCents } from "@/domain/money";
import { DocSection, DocShell, Prose } from "@/components/DocShell";
import { fmtDate, fmtNum, fmtPct } from "@/components/ui";

export const metadata = { title: "Audit report" };

const CLASS_TONE: Record<string, string> = {
  AGENT_READY: "bg-emerald-50 text-emerald-700",
  AUTOMATE: "bg-signal/10 text-signal",
  REDESIGN_FIRST: "bg-amber-50 text-amber-800",
  HUMAN_ONLY: "bg-slate-100 text-slate-600",
};

/** Client deliverable generated from the audit workspace (save as PDF from the browser). */
export default async function AuditReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx();
  const ws = await load(getAuditWorkspace(ctx, id));
  const { audit } = ws;
  const cur = audit.currency;
  const pilot = ws.agenticOpportunities.find((a) => a.recommended_for_pilot);
  const pilotRoiKey = pilot?.roi_scenario_id ? ws.roiVersions.find((v) => v.id === pilot.roi_scenario_id)?.scenario_key : undefined;
  const pilotRoi = pilotRoiKey ? ws.roiScenarios.find((r) => r.scenario_key === pilotRoiKey) : undefined;
  const ranked = [...ws.processes].sort((a, b) => Number(b.score?.calculated_score ?? -1) - Number(a.score?.calculated_score ?? -1));
  const range = (lo: number, hi: number) => `${formatCents(lo, cur)} – ${formatCents(hi, cur)}`;

  return (
    <DocShell
      kind="Agentic Operations Audit"
      title="Audit report"
      client={audit.company_name}
      backHref={`/audits/${id}`}
      meta={[
        ["Date", fmtDate(audit.presentation_at ?? new Date())],
        ["Prepared by", audit.owner_name ?? "RH Digital Agency"],
        ["Processes reviewed", String(ws.processes.length)],
        ["Overall opportunity score", ws.overallScore === null ? "—" : `${fmtNum(ws.overallScore)} / 100`],
      ]}
    >
      <DocSection title="Executive summary">
        <Prose text={audit.executive_summary} fallback="Add the executive summary in the audit workspace (Discovery section)." />
        {pilot ? (
          <div className="mt-4 rounded-lg border border-frost bg-mist/60 p-4">
            <div className="eyebrow">Recommended pilot</div>
            <p className="mt-1 font-semibold text-navy">{pilot.proposed_responsibility}</p>
            {pilotRoi ? <p className="mt-1 text-sm">Estimated value: <b>{range(pilotRoi.monthly_value_low_cents, pilotRoi.monthly_value_high_cents)} per month</b>; payback {pilotRoi.payback_months_low ?? "n/a"}–{pilotRoi.payback_months_high ?? "n/a"} months.</p> : null}
          </div>
        ) : null}
      </DocSection>

      <DocSection title="Business context">
        <div className="grid gap-5 sm:grid-cols-3">
          <div><h3 className="text-sm">Goals</h3><Prose text={audit.business_goals} fallback="Not recorded." /></div>
          <div><h3 className="text-sm">Team</h3><Prose text={audit.team_summary} fallback="Not recorded." /></div>
          <div><h3 className="text-sm">Systems</h3><Prose text={audit.systems_summary} fallback="Not recorded." /></div>
        </div>
      </DocSection>

      <DocSection title="Process inventory and classification">
        <p className="mb-3">Each process was mapped and classified as <b>Human only</b> (professional judgment stays with people), <b>Automate</b> (conventional software), <b>Agent-ready</b> (an AI agent can absorb it with defined controls) or <b>Redesign first</b> (simplify before delegating).</p>
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-frost text-[11px] tracking-wider text-slate-500 uppercase">
              <th className="py-2 pr-2">Process</th><th className="py-2 pr-2">Classification</th><th className="py-2 pr-2 text-right">Volume / mo</th><th className="py-2 pr-2 text-right">Hours / mo</th><th className="py-2 text-right">Score</th>
            </tr>
          </thead>
          <tbody>
            {ranked.length === 0 ? <tr><td colSpan={5} className="py-3 text-slate-500">No processes mapped yet.</td></tr> : null}
            {ranked.map((p) => (
              <tr key={p.id} className="border-b border-mist align-top">
                <td className="py-2 pr-2"><div className="font-medium text-navy">{p.name}</div>{p.process_owner ? <div className="text-xs text-slate-500">{p.process_owner}</div> : null}</td>
                <td className="py-2 pr-2"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${CLASS_TONE[p.classification ?? ""] ?? "bg-slate-100 text-slate-500"}`}>{classificationLabel(p.classification)}</span></td>
                <td className="py-2 pr-2 text-right tabular-nums">{fmtNum(p.monthly_volume, 0)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{fmtNum(p.monthly_hours)}</td>
                <td className="py-2 text-right font-semibold tabular-nums text-navy">{p.score ? fmtNum(p.score.calculated_score) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-slate-500">Agentic Opportunity Score (0–100) weighs economic impact, volume, repetitiveness, data availability, rule clarity and time-to-value, and lowers the score for human judgment, error consequence and implementation difficulty. The score ranks opportunities; it never overrides risk.</p>
      </DocSection>

      {ws.agenticOpportunities.length ? (
        <DocSection title="Agentic opportunities">
          <ol className="space-y-3">
            {ws.agenticOpportunities.map((a, i) => (
              <li key={a.id} className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-rh text-xs font-bold text-white">{i + 1}</span>
                <div>
                  <p className="font-medium text-navy">{a.proposed_responsibility}{a.recommended_for_pilot ? <span className="ml-2 rounded-full bg-cta/10 px-2 py-0.5 text-[11px] font-semibold text-cta-600">Recommended pilot</span> : null}</p>
                  <p className="text-xs text-slate-500">Process: {a.process_name} · Score {fmtNum(a.latest_score)} · Risk {a.risk_level?.toLowerCase() ?? "—"} · Difficulty {a.difficulty_level?.toLowerCase() ?? "—"} · Priority {a.priority ?? "—"}</p>
                  {a.expected_benefit ? <p className="text-sm">{a.expected_benefit}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        </DocSection>
      ) : null}

      {ws.roiScenarios.length ? (
        <DocSection title="Estimated value (ROI scenarios)">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-frost text-[11px] tracking-wider text-slate-500 uppercase">
                <th className="py-2 pr-2">Scenario</th><th className="py-2 pr-2">Monthly value</th><th className="py-2 pr-2">Annualized</th><th className="py-2 pr-2">Payback</th><th className="py-2">First-year ROI</th>
              </tr>
            </thead>
            <tbody>
              {ws.roiScenarios.map((r) => (
                <tr key={r.id} className="border-b border-mist">
                  <td className="py-2 pr-2 font-medium text-navy">{r.name}</td>
                  <td className="py-2 pr-2 tabular-nums">{range(r.monthly_value_low_cents, r.monthly_value_high_cents)}</td>
                  <td className="py-2 pr-2 tabular-nums">{range(r.annual_value_low_cents, r.annual_value_high_cents)}</td>
                  <td className="py-2 pr-2 tabular-nums">{r.payback_months_low ?? "n/a"}–{r.payback_months_high ?? "n/a"} mo</td>
                  <td className="py-2 tabular-nums">{fmtPct(r.roi_low)} – {fmtPct(r.roi_high)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-500">Ranges reflect uncertain assumptions (recovered capacity, recovered revenue, quality savings, platform and supervision costs). They are estimates for decision-making, not guaranteed savings or revenue.</p>
        </DocSection>
      ) : null}

      <DocSection title="90-day roadmap">
        <Prose text={audit.roadmap_90_day} fallback="Add the 90-day roadmap in the audit workspace (Discovery section)." />
      </DocSection>

      <DocSection title="Human oversight">
        <p>Professional judgment stays human; operational execution can become agentic. Every agent we deploy has a defined responsibility, allowed and prohibited actions, approval thresholds, a named escalation owner, logging and a rollback procedure.</p>
        {audit.regulated ? <p className="mt-2 rounded-lg bg-amber-50 p-3 text-amber-900">For this regulated practice, agents handle administrative and operational work only. They never provide legal, clinical or other professional advice, diagnosis or recommendations; any uncertainty escalates to an authorized professional.</p> : null}
      </DocSection>
    </DocShell>
  );
}
