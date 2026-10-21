import { load, requireCtx } from "@/lib/auth/current";
import { getProposal } from "@/server/proposals";
import { formatCents } from "@/domain/money";
import { DocSection, DocShell, Prose } from "@/components/DocShell";
import { fmtDate } from "@/components/ui";

export const metadata = { title: "Proposal" };

const TYPE_LABEL: Record<string, string> = {
  PILOT: "Agentic Pilot",
  DEPLOYMENT: "Agentic Deployment",
  RETAINER: "Optimization Retainer",
  SMB_STARTER: "Agentic Business Starter",
};

/** Client-facing proposal generated from the proposal record (save as PDF from the browser). */
export default async function ProposalDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx();
  const p = await load(getProposal(ctx, id));
  const cur = p.currency;
  const net = p.amount_cents - p.audit_credit_cents;
  const [roi] = p.agentic_opportunity_id
    ? await ctx.db.query<{ name: string; monthly_value_low_cents: number; monthly_value_high_cents: number; payback_months_low: number | null; payback_months_high: number | null }>(
        `select r.name, r.monthly_value_low_cents, r.monthly_value_high_cents, r.payback_months_low, r.payback_months_high
         from agentic_opportunities ao join roi_scenarios r on r.id = ao.roi_scenario_id where ao.id = $1`,
        [p.agentic_opportunity_id],
      )
    : [];
  const issued = p.sent_at ?? p.created_at;
  const validUntil = new Date(new Date(issued).getTime() + 30 * 86400000);
  const monthly = p.proposal_type === "RETAINER";

  return (
    <DocShell
      kind={TYPE_LABEL[p.proposal_type] ?? "Proposal"}
      title={p.title}
      client={p.company_name}
      backHref={`/proposals/${id}`}
      meta={[
        ["Issued", fmtDate(issued)],
        ["Valid until", fmtDate(validUntil)],
        ["Investment", `${formatCents(net, cur)}${monthly ? " / month" : ""}`],
      ]}
    >
      <DocSection title="Scope">
        <Prose text={p.scope_summary} fallback="Scope to be confirmed." />
      </DocSection>

      {roi ? (
        <DocSection title="Expected impact">
          <p>Based on the audit findings (scenario “{roi.name}”), the estimated value is <b>{formatCents(roi.monthly_value_low_cents, cur)} – {formatCents(roi.monthly_value_high_cents, cur)} per month</b>, with an estimated payback of {roi.payback_months_low ?? "n/a"}–{roi.payback_months_high ?? "n/a"} months.</p>
          <p className="mt-2 text-xs text-slate-500">Estimates, not guarantees. We capture baseline metrics before launch and measure results after deployment.</p>
        </DocSection>
      ) : null}

      <DocSection title="Investment">
        <table className="w-full max-w-md text-[14px]">
          <tbody>
            <tr className="border-b border-mist"><td className="py-2">{TYPE_LABEL[p.proposal_type]}{monthly ? " (monthly)" : ""}</td><td className="py-2 text-right tabular-nums">{formatCents(p.amount_cents, cur)}</td></tr>
            {p.audit_credit_cents > 0 ? (
              <tr className="border-b border-mist text-emerald-700"><td className="py-2">Audit fee credit</td><td className="py-2 text-right tabular-nums">− {formatCents(p.audit_credit_cents, cur)}</td></tr>
            ) : null}
            <tr><td className="py-2 font-semibold text-navy">Total{monthly ? " per month" : ""}</td><td className="py-2 text-right font-display text-xl font-bold tabular-nums text-navy">{formatCents(net, cur)}</td></tr>
          </tbody>
        </table>
        {p.audit_credit_cents > 0 ? <p className="mt-2 text-xs text-slate-500">The paid audit fee is credited because this implementation is contracted within 30 days of the audit.</p> : null}
      </DocSection>

      <DocSection title="How we work">
        <ol className="list-decimal space-y-1 pl-5">
          <li><b>Design</b> — confirm the process, the agent&apos;s responsibility and its limits.</li>
          <li><b>Control</b> — define allowed and prohibited actions, approval thresholds, escalation owner and rollback.</li>
          <li><b>Build and test</b> — configure integrations and pass the agreed test cases before launch.</li>
          <li><b>Launch and measure</b> — monitor closely, then compare results against the baseline.</li>
        </ol>
        <p className="mt-3">Professional judgment stays with your team; agents handle operational execution. Your accounts, data and subscriptions remain under your ownership.</p>
      </DocSection>

      <DocSection title="Next steps">
        <p>To proceed, confirm acceptance of this proposal before {fmtDate(validUntil)}. We will schedule the kickoff and capture baseline metrics in the first week.</p>
      </DocSection>
    </DocShell>
  );
}
