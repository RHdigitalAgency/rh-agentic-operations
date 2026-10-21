import type { Queryable } from "@/lib/db/types";
import { requireCap } from "@/lib/auth/user";
import { assertFound, ConflictError, ValidationError } from "@/lib/errors";
import { bool, oneOf, optDay, optStr, reqStr, todayLocal } from "@/lib/validate";
import { normalizeCurrency } from "@/domain/money";
import { autoAdvance, getOpportunity } from "./crm";
import { getAgenticOpportunity, getAudit } from "./audits";
import { companyVisible, lockStatus, logAudit, Sql, type Ctx } from "./context";

export const PROPOSAL_TYPES = ["PILOT", "DEPLOYMENT", "RETAINER", "SMB_STARTER"] as const;
export type ProposalType = (typeof PROPOSAL_TYPES)[number];

export interface ProposalRow {
  id: string;
  company_id: string;
  company_name: string;
  opportunity_id: string | null;
  audit_id: string | null;
  agentic_opportunity_id: string | null;
  proposal_type: ProposalType;
  title: string;
  scope_summary: string | null;
  amount_cents: number;
  /** Paid audit fee credited against this proposal (30-day policy). Net price = amount_cents - audit_credit_cents. */
  audit_credit_cents: number;
  currency: string;
  status: "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "WITHDRAWN";
  sent_at: Date | null;
  decision_at: Date | null;
  created_at: Date;
  deployment_id: string | null;
  retainer_id: string | null;
}

const SELECT = `
  select p.*, c.name as company_name,
    (select d.id from deployments d where d.proposal_id = p.id) as deployment_id,
    (select r.id from retainers r where r.proposal_id = p.id) as retainer_id
  from proposals p join companies c on c.id = p.company_id`;

export async function listProposals(ctx: Ctx, f: { status?: string } = {}) {
  requireCap(ctx.user, "proposal.read");
  const q = new Sql();
  const where = [companyVisible(q, ctx.user, "c")];
  if (f.status) where.push(`p.status = ${q.p(f.status)}`);
  return ctx.db.query<ProposalRow>(`${SELECT} where ${where.join(" and ")} order by p.created_at desc`, q.params);
}

export async function getProposal(ctx: Ctx, id: string, db: Queryable = ctx.db): Promise<ProposalRow> {
  requireCap(ctx.user, "proposal.read");
  const q = new Sql();
  const [row] = await db.query<ProposalRow>(`${SELECT} where p.id = ${q.p(id)} and ${companyVisible(q, ctx.user, "c")}`, q.params);
  return assertFound(row, "Proposal");
}

export const AUDIT_CREDIT_WINDOW_DAYS = 30;

export interface AuditCreditEligibility {
  eligible: boolean;
  creditCents: number;
  daysLeft: number | null;
  reason: string | null;
}

/**
 * Audit credit policy (Strategic Plan §4): a paid audit's fee may be credited against an implementation
 * (pilot / deployment / starter) contracted within 30 days of payment. One credit per audit.
 */
export async function auditCreditEligibility(db: Queryable, auditId: string | null, opts: { excludeProposalId?: string; at?: Date } = {}): Promise<AuditCreditEligibility> {
  const no = (reason: string): AuditCreditEligibility => ({ eligible: false, creditCents: 0, daysLeft: null, reason });
  if (!auditId) return no("No linked audit");
  const [a] = await db.query<{ price_cents: number; paid_at: Date | null; status: string }>("select price_cents, paid_at, status from audits where id = $1", [auditId]);
  if (!a || !a.paid_at || a.status === "CANCELLED") return no("The audit has not been paid");
  const at = opts.at ?? new Date();
  const days = (at.getTime() - new Date(a.paid_at).getTime()) / 86400000;
  if (days > AUDIT_CREDIT_WINDOW_DAYS) return no(`The audit was paid ${Math.floor(days)} days ago (credit window is ${AUDIT_CREDIT_WINDOW_DAYS} days)`);
  const [used] = await db.query(
    "select 1 from proposals where audit_id = $1 and audit_credit_cents > 0 and status in ('DRAFT','SENT','ACCEPTED') and id is distinct from $2",
    [auditId, opts.excludeProposalId ?? null],
  );
  if (used) return no("The audit credit is already applied to another proposal");
  return { eligible: true, creditCents: Number(a.price_cents), daysLeft: Math.max(0, Math.ceil(AUDIT_CREDIT_WINDOW_DAYS - days)), reason: null };
}

async function resolveCredit(db: Queryable, auditId: string | null, type: string, amount: number, apply: boolean, excludeProposalId?: string): Promise<number> {
  if (!apply) return 0;
  if (type === "RETAINER") throw new ValidationError("The audit credit applies to implementation proposals, not retainers");
  const e = await auditCreditEligibility(db, auditId, { excludeProposalId });
  if (!e.eligible) throw new ValidationError(`Audit credit not available: ${e.reason}`);
  if (e.creditCents > amount) throw new ValidationError("The audit credit cannot exceed the proposal amount");
  return e.creditCents;
}

function amountOf(v: unknown): number {
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n <= 0) throw new ValidationError("Proposal amount is required");
  return n;
}

/**
 * Converts the recommended pilot (agentic opportunity) into a linked proposal. Company, opportunity and audit
 * are derived from the audit chain, so no client or process data is re-entered.
 */
export async function createProposalFromAgenticOpportunity(ctx: Ctx, agenticOpportunityId: string, input: Record<string, unknown>) {
  requireCap(ctx.user, "proposal.write");
  const { ao, audit } = await getAgenticOpportunity(ctx, agenticOpportunityId);
  if (!ao.recommended_for_pilot) throw new ValidationError("Only the recommended pilot can seed a proposal from the audit");
  if (!["PRESENTED", "IN_PROGRESS"].includes(audit.status)) throw new ValidationError("The audit must be in progress or presented");
  const type = input.proposal_type ? oneOf(input.proposal_type, PROPOSAL_TYPES, "proposal type") : "PILOT";
  const amount = amountOf(input.amount_cents);
  const credit = await resolveCredit(ctx.db, audit.id, type, amount, bool(input.apply_audit_credit));
  return ctx.db.transaction(async (tx) => {
    await lockStatus(tx, "agentic_opportunities", agenticOpportunityId);
    const [dup] = await tx.query("select id from proposals where agentic_opportunity_id = $1 and status in ('DRAFT','SENT','ACCEPTED')", [agenticOpportunityId]);
    if (dup) throw new ConflictError("An active proposal already exists for this opportunity");
    const title = optStr(input.title, 200) ?? `${type === "PILOT" ? "Agentic Pilot" : "Agentic Deployment"}: ${ao.process_name}`;
    const scope = optStr(input.scope_summary, 8000) ?? `${ao.proposed_responsibility}${ao.expected_benefit ? `\n\nExpected benefit: ${ao.expected_benefit}` : ""}`;
    const [row] = await tx.query<{ id: string }>(
      `insert into proposals(company_id, opportunity_id, audit_id, agentic_opportunity_id, proposal_type, title, scope_summary, amount_cents, audit_credit_cents, currency, status, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'DRAFT',$11) returning id`,
      [audit.company_id, audit.opportunity_id, audit.id, agenticOpportunityId, type, title, scope, amount, credit, audit.currency, ctx.user.id],
    );
    await logAudit(tx, ctx.user, "proposal", row.id, "create", null, { type, amount_cents: amount, audit_credit_cents: credit, from_agentic_opportunity: agenticOpportunityId });
    return row.id;
  });
}

/** Generic proposal linked to an existing opportunity (e.g. retainer after a deployment). */
export async function createProposal(ctx: Ctx, input: Record<string, unknown>) {
  requireCap(ctx.user, "proposal.write");
  const opp = await getOpportunity(ctx, reqStr(input.opportunity_id, "Opportunity"));
  const type = oneOf(input.proposal_type, PROPOSAL_TYPES, "proposal type");
  const amount = amountOf(input.amount_cents);
  const auditId = optStr(input.audit_id, 64);
  if (auditId) {
    const audit = await getAudit(ctx, auditId);
    if (audit.company_id !== opp.company_id) throw new ValidationError("Audit belongs to a different company");
  }
  const credit = await resolveCredit(ctx.db, auditId, type, amount, bool(input.apply_audit_credit));
  return ctx.db.transaction(async (tx) => {
    const [row] = await tx.query<{ id: string }>(
      `insert into proposals(company_id, opportunity_id, audit_id, proposal_type, title, scope_summary, amount_cents, audit_credit_cents, currency, status, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'DRAFT',$10) returning id`,
      [opp.company_id, opp.id, auditId, type, reqStr(input.title, "Title", 200), optStr(input.scope_summary, 8000), amount, credit,
        normalizeCurrency(optStr(input.currency, 3) ?? opp.currency), ctx.user.id],
    );
    await logAudit(tx, ctx.user, "proposal", row.id, "create", null, { type, amount_cents: amount, audit_credit_cents: credit, opportunity_id: opp.id });
    return row.id;
  });
}

export async function updateProposalDraft(ctx: Ctx, id: string, input: Record<string, unknown>) {
  requireCap(ctx.user, "proposal.write");
  const p = await getProposal(ctx, id);
  if (p.status !== "DRAFT") throw new ValidationError("Only draft proposals can be edited");
  const amount = amountOf(input.amount_cents);
  const after = {
    title: reqStr(input.title, "Title", 200),
    scope_summary: optStr(input.scope_summary, 8000),
    amount_cents: amount,
    audit_credit_cents: await resolveCredit(ctx.db, p.audit_id, p.proposal_type, amount, bool(input.apply_audit_credit), id),
  };
  await ctx.db.transaction(async (tx) => {
    await lockStatus(tx, "proposals", id, ["DRAFT"]);
    await tx.query("update proposals set title=$2, scope_summary=$3, amount_cents=$4, audit_credit_cents=$5, updated_at=now() where id=$1", [id, after.title, after.scope_summary, after.amount_cents, after.audit_credit_cents]);
    await logAudit(tx, ctx.user, "proposal", id, "update", { title: p.title, amount_cents: p.amount_cents, audit_credit_cents: p.audit_credit_cents }, after);
  });
}

export async function sendProposal(ctx: Ctx, id: string) {
  requireCap(ctx.user, "proposal.write");
  const p = await getProposal(ctx, id);
  if (p.status !== "DRAFT") throw new ValidationError("Only draft proposals can be sent");
  await ctx.db.transaction(async (tx) => {
    await lockStatus(tx, "proposals", id, ["DRAFT"]);
    await tx.query("update proposals set status='SENT', sent_at=now(), updated_at=now() where id=$1", [id]);
    await logAudit(tx, ctx.user, "proposal", id, "status_change", { status: "DRAFT" }, { status: "SENT" });
    if (p.opportunity_id) {
      await tx.query("update opportunities set next_action = 'Follow up on proposal decision', next_action_at = now() + interval '5 days', updated_at = now() where id = $1 and stage not in ('WON_DEPLOYMENT','WON_RETAINER')", [p.opportunity_id]);
    }
    await autoAdvance(tx, ctx.user, p.opportunity_id, "AUDIT_PRESENTED", "PROPOSAL_SENT");
  });
}

/**
 * Accepting a proposal records the decision and creates the linked delivery record without re-entering client data:
 * PILOT / DEPLOYMENT / SMB_STARTER -> deployment; RETAINER -> retainer (MRR).
 */
export async function acceptProposal(ctx: Ctx, id: string, input: Record<string, unknown> = {}) {
  requireCap(ctx.user, "proposal.write");
  const p = await getProposal(ctx, id);
  if (p.status !== "SENT") throw new ValidationError("Only sent proposals can be accepted");
  if (p.audit_credit_cents > 0) {
    const e = await auditCreditEligibility(ctx.db, p.audit_id, { excludeProposalId: id });
    if (!e.eligible) throw new ValidationError(`The audit credit has expired (${e.reason}). Withdraw this proposal and issue a new one without the credit.`);
  }
  const deliveryOwner = optStr(input.delivery_owner_user_id, 64);
  if (deliveryOwner) {
    const [u] = await ctx.db.query<{ role: string }>("select role from app_users where id = $1 and active", [deliveryOwner]);
    if (!u || !["DELIVERY", "ADMIN_MANAGER"].includes(u.role)) throw new ValidationError("Delivery owner must be an active delivery user or manager");
  }
  return ctx.db.transaction(async (tx) => {
    await lockStatus(tx, "proposals", id, ["SENT"]);
    await tx.query("update proposals set status='ACCEPTED', decision_at=now(), updated_at=now() where id=$1", [id]);
    await logAudit(tx, ctx.user, "proposal", id, "status_change", { status: "SENT" }, { status: "ACCEPTED", amount_cents: p.amount_cents, audit_credit_cents: p.audit_credit_cents, net_cents: p.amount_cents - p.audit_credit_cents });
    if (p.proposal_type === "RETAINER") {
      const [r] = await tx.query<{ id: string }>(
        "insert into retainers(company_id, proposal_id, mrr_cents, currency, start_date, status, services) values ($1,$2,$3,$4,$5,'ACTIVE',$6) returning id",
        [p.company_id, id, p.amount_cents, p.currency, optDay(input.start_date, "Start date") ?? todayLocal(), p.scope_summary],
      );
      await logAudit(tx, ctx.user, "retainer", r.id, "create", null, { mrr_cents: p.amount_cents, proposal_id: id });
      if (p.opportunity_id) await tx.query("update opportunities set next_action = null, next_action_at = null where id = $1", [p.opportunity_id]);
      const advanced = await autoAdvance(tx, ctx.user, p.opportunity_id, "PROPOSAL_SENT", "WON_RETAINER");
      if (!advanced) await autoAdvance(tx, ctx.user, p.opportunity_id, "WON_DEPLOYMENT", "WON_RETAINER");
      return { retainerId: r.id, deploymentId: null };
    }
    const [d] = await tx.query<{ id: string }>(
      `insert into deployments(company_id, proposal_id, name, status, scope_included, owner_user_id, start_date)
       values ($1,$2,$3,'PLANNED',$4,$5,$6) returning id`,
      [p.company_id, id, p.title, p.scope_summary, deliveryOwner, optDay(input.start_date, "Start date")],
    );
    await logAudit(tx, ctx.user, "deployment", d.id, "create", null, { status: "PLANNED", proposal_id: id });
    if (p.opportunity_id) await tx.query("update opportunities set next_action = null, next_action_at = null where id = $1", [p.opportunity_id]);
    await autoAdvance(tx, ctx.user, p.opportunity_id, "PROPOSAL_SENT", "WON_DEPLOYMENT");
    return { deploymentId: d.id, retainerId: null };
  });
}

export async function rejectProposal(ctx: Ctx, id: string) {
  requireCap(ctx.user, "proposal.write");
  const p = await getProposal(ctx, id);
  if (p.status !== "SENT") throw new ValidationError("Only sent proposals can be rejected");
  await ctx.db.transaction(async (tx) => {
    await lockStatus(tx, "proposals", id, ["SENT"]);
    await tx.query("update proposals set status='REJECTED', decision_at=now(), updated_at=now() where id=$1", [id]);
    await logAudit(tx, ctx.user, "proposal", id, "status_change", { status: "SENT" }, { status: "REJECTED" });
  });
}

export async function withdrawProposal(ctx: Ctx, id: string) {
  requireCap(ctx.user, "proposal.write");
  const p = await getProposal(ctx, id);
  if (!["DRAFT", "SENT"].includes(p.status)) throw new ValidationError("Only draft or sent proposals can be withdrawn");
  await ctx.db.transaction(async (tx) => {
    await lockStatus(tx, "proposals", id, ["DRAFT", "SENT"]);
    await tx.query("update proposals set status='WITHDRAWN', updated_at=now() where id=$1", [id]);
    await logAudit(tx, ctx.user, "proposal", id, "status_change", { status: p.status }, { status: "WITHDRAWN" });
  });
}

export async function setRetainerStatus(ctx: Ctx, retainerId: string, statusInput: unknown) {
  requireCap(ctx.user, "proposal.write");
  const status = oneOf(statusInput, ["ACTIVE", "PAUSED", "CANCELLED"] as const, "retainer status");
  const [r] = await ctx.db.query<{ company_id: string; status: string }>("select company_id, status from retainers where id = $1", [retainerId]);
  assertFound(r, "Retainer");
  const q = new Sql();
  const [visible] = await ctx.db.query(`select 1 from companies c where c.id = ${q.p(r.company_id)} and ${companyVisible(q, ctx.user, "c")}`, q.params);
  assertFound(visible, "Retainer");
  await ctx.db.transaction(async (tx) => {
    await tx.query("update retainers set status = $2, end_date = case when $2 = 'CANCELLED' then current_date else end_date end where id = $1", [retainerId, status]);
    await logAudit(tx, ctx.user, "retainer", retainerId, "status_change", { status: r.status }, { status });
  });
}
