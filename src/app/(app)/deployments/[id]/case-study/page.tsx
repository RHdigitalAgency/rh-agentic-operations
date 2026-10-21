import Link from "next/link";
import { load, requireCtx } from "@/lib/auth/current";
import { getDeploymentWorkspace } from "@/server/deployments";
import { Badge, fmtDate, fmtNum, fmtPct } from "@/components/ui";
import { formatCents } from "@/domain/money";

/** Internal one-page case-study summary generated from delivery records (not for public use without approval). */
export default async function CaseStudyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx();
  const ws = await load(getDeploymentWorkspace(ctx, id));
  const d = ws.deployment;
  const cur = d.currency ?? "USD";
  const block = (title: string, body: string | null) => (
    <section className="break-inside-avoid">
      <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{title}</h3>
      <p className="mt-1 text-sm whitespace-pre-wrap">{body || <span className="text-slate-400">Not captured yet.</span>}</p>
    </section>
  );
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-3 flex items-center justify-between print:hidden">
        <Link href={`/deployments/${id}`}>← Back to deployment</Link>
        <span className="muted">Use your browser&apos;s print to save as PDF</span>
      </div>
      <article className="card space-y-5 p-8">
        <header className="border-b border-slate-200 pb-4">
          <div className="text-xs font-semibold tracking-widest text-brand-700 uppercase">RH Agentic Operations · Internal case summary</div>
          <h1 className="mt-1 text-2xl">{d.company_name} — {d.name}</h1>
          <div className="mt-1 flex flex-wrap gap-2 text-sm text-slate-600">
            <span>{d.vertical ?? "—"}</span>·<span>Launched {fmtDate(d.launch_date)}</span>·<span>Status {d.status.toLowerCase()}</span>·
            <Badge tone={d.client_approval_status === "APPROVED" ? "green" : "amber"}>public use: {d.client_approval_status.replace("_", " ").toLowerCase()}</Badge>
          </div>
        </header>
        {block("Before", d.before_narrative)}
        {block("Intervention", d.intervention_summary)}
        <section>
          <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Control model</h3>
          <ul className="mt-1 space-y-1 text-sm">
            {ws.roles.length ? ws.roles.map((r) => (
              <li key={r.id}><b>{r.name}:</b> {r.responsibility}. <span className="text-slate-600">Escalates to {r.escalation_owner ?? "—"}; approvals: {r.approval_requirements ?? "—"}.</span></li>
            )) : <li className="text-slate-400">No agent roles recorded.</li>}
          </ul>
        </section>
        {block("After", d.after_narrative)}
        <section>
          <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Metrics (baseline → latest result)</h3>
          <table className="table mt-1">
            <thead><tr><th>Metric</th><th className="text-right">Baseline</th><th className="text-right">Result</th><th className="text-right">Change</th><th>Window</th></tr></thead>
            <tbody>{ws.comparison.map((c) => (
              <tr key={c.metric_key}>
                <td>{c.metric_key} ({c.unit})</td>
                <td className="text-right">{fmtNum(c.baseline?.value)}</td>
                <td className="text-right">{fmtNum(c.latestResult?.value)}</td>
                <td className="text-right">{fmtPct(c.deltaPct)}</td>
                <td>{c.latestResult ? `${fmtDate(c.latestResult.window_start)} – ${fmtDate(c.latestResult.window_end)}` : "—"}</td>
              </tr>
            ))}</tbody>
          </table>
          {ws.financials ? (
            <p className="mt-2 text-sm text-slate-600">
              Contract {formatCents(ws.financials.revenueCents, cur)} · delivery {fmtNum(d.hours)} h · gross margin {fmtPct(ws.financials.grossMargin)}
              {ws.financials.clientRoi ? ` · measured client ROI ${fmtNum(ws.financials.clientRoi, 2)}× (annualized)` : ""}
            </p>
          ) : null}
        </section>
        {block("Lesson / reusable IP", [d.lessons, d.reusable_assets_notes].filter(Boolean).join("\n\n") || null)}
        <footer className="border-t border-slate-200 pt-3 text-xs text-slate-500">
          Generated from delivery records. Results are measured outcomes for this engagement, not guarantees. Anonymize before any external use.
        </footer>
      </article>
    </div>
  );
}
