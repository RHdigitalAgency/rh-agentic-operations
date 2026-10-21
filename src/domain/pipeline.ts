/** Fixed sales pipeline (PDR §5). Codes match the pipeline_stages reference table. */
export const STAGES = [
  "NEW_LEAD",
  "CONTACTED",
  "FIT_CALL_BOOKED",
  "FIT_QUALIFIED",
  "AUDIT_OFFERED",
  "AUDIT_PAID",
  "AUDIT_IN_PROGRESS",
  "AUDIT_PRESENTED",
  "PROPOSAL_SENT",
  "WON_DEPLOYMENT",
  "WON_RETAINER",
  "LOST_NURTURE",
] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  NEW_LEAD: "New Lead",
  CONTACTED: "Contacted",
  FIT_CALL_BOOKED: "Fit Call Booked",
  FIT_QUALIFIED: "Fit Qualified",
  AUDIT_OFFERED: "Audit Offered",
  AUDIT_PAID: "Audit Paid",
  AUDIT_IN_PROGRESS: "Audit In Progress",
  AUDIT_PRESENTED: "Audit Presented",
  PROPOSAL_SENT: "Proposal Sent",
  WON_DEPLOYMENT: "Won - Pilot / Deployment",
  WON_RETAINER: "Won - Retainer",
  LOST_NURTURE: "Lost / Nurture",
};

export const OPEN_STAGES: readonly Stage[] = STAGES.slice(0, 9);
export const WON_STAGES: readonly Stage[] = ["WON_DEPLOYMENT", "WON_RETAINER"];

export const isStage = (v: unknown): v is Stage => typeof v === "string" && (STAGES as readonly string[]).includes(v);
export const isOpen = (s: Stage) => OPEN_STAGES.includes(s);
export const stageIndex = (s: Stage) => STAGES.indexOf(s);

/** Facts about an opportunity, gathered from the database, that gate stage transitions. */
export interface TransitionFacts {
  hasOwner: boolean;
  hasNextAction: boolean;
  hasScheduledFitCall: boolean;
  hasQualifiedFitCall: boolean; // completed, outcome QUALIFIED, audit recommended
  hasAuditOffer: boolean;
  hasPaidAudit: boolean;
  auditInProgressOrLater: boolean;
  auditPresented: boolean;
  hasSentProposal: boolean;
  hasAcceptedImplementationProposal: boolean; // PILOT / DEPLOYMENT / SMB_STARTER
  hasAcceptedRetainer: boolean;
  lossReason: string | null;
  nurtureAt: Date | string | null;
}

export type TransitionResult = { ok: true } | { ok: false; reason: string };

/** Structural rule: which target stages are reachable from a stage. */
export function allowedTargets(from: Stage, opts: { isManager: boolean }): Stage[] {
  const targets = new Set<Stage>();
  const i = stageIndex(from);
  if (isOpen(from)) {
    if (from === "PROPOSAL_SENT") {
      targets.add("WON_DEPLOYMENT");
      targets.add("WON_RETAINER");
    } else {
      targets.add(STAGES[i + 1]);
    }
    targets.add("LOST_NURTURE");
    // Managers may move backwards to correct data entry errors (audit-logged).
    if (opts.isManager) for (let j = 0; j < i; j++) targets.add(STAGES[j]);
  } else if (from === "WON_DEPLOYMENT") {
    targets.add("WON_RETAINER"); // expansion into optimization retainer
  } else if (from === "LOST_NURTURE") {
    targets.add("NEW_LEAD"); // re-open a nurtured lead
    targets.add("CONTACTED");
  }
  return [...targets];
}

/** Full rule: structural reachability plus the PDR exit conditions. */
export function checkTransition(from: Stage, to: Stage, facts: TransitionFacts, opts: { isManager: boolean }): TransitionResult {
  if (from === to) return { ok: false, reason: "Opportunity is already in that stage" };
  if (!allowedTargets(from, opts).includes(to)) {
    return { ok: false, reason: `Cannot move from ${STAGE_LABELS[from]} to ${STAGE_LABELS[to]}` };
  }
  const backwards = isOpen(to) && isOpen(from) && stageIndex(to) < stageIndex(from);
  if (backwards) return { ok: true };

  if (to === "LOST_NURTURE") {
    return facts.lossReason || facts.nurtureAt ? { ok: true } : { ok: false, reason: "A loss reason or a nurture date is required" };
  }
  if (from === "NEW_LEAD" && (!facts.hasOwner || !facts.hasNextAction)) {
    return { ok: false, reason: "Assign an owner and define the next action before leaving New Lead" };
  }
  const gate: Partial<Record<Stage, [boolean, string]>> = {
    FIT_CALL_BOOKED: [facts.hasScheduledFitCall, "Schedule a fit call first"],
    FIT_QUALIFIED: [facts.hasQualifiedFitCall, "Complete a fit call with outcome Qualified and audit recommended"],
    AUDIT_OFFERED: [facts.hasAuditOffer, "Create the audit offer (price/terms) first"],
    AUDIT_PAID: [facts.hasPaidAudit, "Confirm audit payment first"],
    AUDIT_IN_PROGRESS: [facts.auditInProgressOrLater, "Start the audit (discovery) first"],
    AUDIT_PRESENTED: [facts.auditPresented, "Mark the audit as presented first"],
    PROPOSAL_SENT: [facts.hasSentProposal, "Send a proposal first"],
    WON_DEPLOYMENT: [facts.hasAcceptedImplementationProposal, "Record an accepted pilot/deployment proposal first"],
    WON_RETAINER: [facts.hasAcceptedRetainer, "Record an accepted retainer proposal first"],
  };
  const g = gate[to];
  if (g && !g[0]) return { ok: false, reason: g[1] };
  return { ok: true };
}
