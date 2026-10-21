import { randomUUID } from "node:crypto";
import type { Queryable } from "@/lib/db/types";
import { requireCap } from "@/lib/auth/user";
import { assertFound, ConflictError, ForbiddenError, ValidationError } from "@/lib/errors";
import { bool, optDate, optList, optNum, optOneOf, optStr, optUrl, reqStr } from "@/lib/validate";
import { normalizeCurrency } from "@/domain/money";
import { calculateRoi, parseRoiAssumptions, ROI_MODEL_VERSION } from "@/domain/roi";
import { calculateScore, riskFlags, validateRawScores, validateWeights, type RawScores, type Weights } from "@/domain/scoring";
import { autoAdvance, getOpportunity } from "./crm";
import { companyVisible, logAudit, Sql, type Ctx } from "./context";

export const AUDIT_STATUSES = ["OFFERED", "PAID", "IN_PROGRESS", "PRESENTED", "CANCELLED"] as const;
export const CLASSIFICATIONS = ["HUMAN_ONLY", "AUTOMATE", "AGENT_READY", "REDESIGN_FIRST"] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

export interface AuditRow {
  id: string;
  company_id: string;
  company_name: string;
  vertical: string | null;
  regulated: boolean;
  opportunity_id: string | null;
  owner_user_id: string | null;
  owner_name: string | null;
  status: (typeof AUDIT_STATUSES)[number];
  price_cents: number;
  currency: string;
  paid_at: Date | null;
  payment_reference: string | null;
  business_goals: string | null;
  team_summary: string | null;
  systems_summary: string | null;
  executive_summary: string | null;
  roadmap_90_day: string | null;
  deliverable_url: string | null;
  presentation_at: Date | null;
  created_at: Date;
}

const AUDIT_SELECT = `
  select a.*, c.name as company_name, c.vertical, coalesce(v.regulated, false) as regulated, u.full_name as owner_name
  from audits a join companies c on c.id = a.company_id
  left join ref_verticals v on v.code = c.vertical
  left join app_users u on u.id = a.owner_user_id`;

export async function listAudits(ctx: Ctx, f: { status?: string } = {}) {
  requireCap(ctx.user, "audit.read");
  const q = new Sql();
  const where = [companyVisible(q, ctx.user, "c")];
  if (f.status) where.push(`a.status = ${q.p(f.status)}`);
  return ctx.db.query<AuditRow & { process_count: number }>(
    `select x.*, (select count(*) from processes p where p.audit_id = x.id)::int as process_count from (${AUDIT_SELECT} where ${where.join(" and ")}) x order by x.created_at desc`,
    q.params,
  );
}

export async function getAudit(ctx: Ctx, id: string, db: Queryable = ctx.db): Promise<AuditRow> {
  requireCap(ctx.user, "audit.read");
  const q = new Sql();
  const [row] = await db.query<AuditRow>(`${AUDIT_SELECT} where a.id = ${q.p(id)} and ${companyVisible(q, ctx.user, "c")}`, q.params);
  return assertFound(row, "Audit");
}

async function resolveAuditOwner(db: Queryable, ownerId: unknown): Promise<string | null> {
  const id = optStr(ownerId, 64);
  if (!id) return null;
  const [u] = await db.query<{ role: string }>("select role from app_users where id = $1 and active", [id]);
  if (!u || !["ADMIN_MANAGER", "AUDITOR_ANALYST", "DELIVERY", "SALES_REP"].includes(u.role)) throw new ValidationError("Audit owner must be an active internal user");
  return id;
}

// ---------------------------------------------------------------------------
// Lifecycle: OFFERED -> PAID -> IN_PROGRESS -> PRESENTED (or CANCELLED)
// ---------------------------------------------------------------------------
export async function offerAudit(ctx: Ctx, opportunityId: string, input: Record<string, unknown>) {
  requireCap(ctx.user, "audit.sell");
  const opp = await getOpportunity(ctx, opportunityId);
  const price = Number(input.price_cents);
  if (!Number.isSafeInteger(price) || price <= 0) throw new ValidationError("Audit price is required: the audit is paid from day one");
  const owner = await resolveAuditOwner(ctx.db, input.owner_user_id);
  return ctx.db.transaction(async (tx) => {
    const [active] = await tx.query("select id from audits where opportunity_id = $1 and status <> 'CANCELLED'", [opportunityId]);
    if (active) throw new ConflictError("This opportunity already has an active audit");
    const currency = normalizeCurrency(optStr(input.currency, 3) ?? opp.currency);
    const [row] = await tx.query<{ id: string }>(
      "insert into audits(company_id, opportunity_id, owner_user_id, status, price_cents, currency) values ($1,$2,$3,'OFFERED',$4,$5) returning id",
      [opp.company_id, opportunityId, owner, price, currency],
    );
    await logAudit(tx, ctx.user, "audit", row.id, "offer", null, { price_cents: price, currency, opportunityId });
    await tx.query("update opportunities set next_action = 'Confirm audit payment', next_action_at = now() + interval '3 days', updated_at = now() where id = $1", [opportunityId]);
    await autoAdvance(tx, ctx.user, opportunityId, "FIT_QUALIFIED", "AUDIT_OFFERED");
    return row.id;
  });
}

/** Manual payment confirmation (v1). A future Stripe webhook should call the same transition. */
export async function confirmAuditPayment(ctx: Ctx, id: string, input: Record<string, unknown>) {
  requireCap(ctx.user, "audit.sell");
  const audit = await getAudit(ctx, id);
  if (audit.status !== "OFFERED") throw new ValidationError("Only an offered audit can be marked paid");
  const paidAt = optDate(input.paid_at, "Payment date") ?? new Date();
  const ref = optStr(input.payment_reference, 200);
  await ctx.db.transaction(async (tx) => {
    await tx.query("update audits set status = 'PAID', paid_at = $2, payment_reference = $3, updated_at = now() where id = $1", [id, paidAt, ref]);
    await logAudit(tx, ctx.user, "audit", id, "payment_confirmed", { status: audit.status, paid_at: null }, { status: "PAID", paid_at: paidAt, payment_reference: ref, price_cents: audit.price_cents });
    if (audit.opportunity_id) {
      await tx.query("update opportunities set next_action = 'Kick off audit discovery', next_action_at = now() + interval '2 days', updated_at = now() where id = $1", [audit.opportunity_id]);
    }
    await autoAdvance(tx, ctx.user, audit.opportunity_id, "AUDIT_OFFERED", "AUDIT_PAID");
  });
}

export async function startAudit(ctx: Ctx, id: string) {
  requireCap(ctx.user, "audit.write");
  const audit = await getAudit(ctx, id);
  if (audit.status !== "PAID") throw new ValidationError("Only a paid audit can be started");
  await ctx.db.transaction(async (tx) => {
    await tx.query("update audits set status = 'IN_PROGRESS', updated_at = now() where id = $1", [id]);
    await logAudit(tx, ctx.user, "audit", id, "status_change", { status: audit.status }, { status: "IN_PROGRESS" });
    if (audit.opportunity_id) {
      await tx.query("update opportunities set next_action = 'Complete audit mapping and present findings', next_action_at = now() + interval '10 days', updated_at = now() where id = $1", [audit.opportunity_id]);
    }
    await autoAdvance(tx, ctx.user, audit.opportunity_id, "AUDIT_PAID", "AUDIT_IN_PROGRESS");
  });
}

export async function presentAudit(ctx: Ctx, id: string, input: Record<string, unknown>) {
  requireCap(ctx.user, "audit.write");
  const audit = await getAudit(ctx, id);
  if (audit.status !== "IN_PROGRESS") throw new ValidationError("Only an in-progress audit can be presented");
  const [{ n, classified }] = await ctx.db.query<{ n: number; classified: number }>(
    "select count(*)::int as n, count(classification)::int as classified from processes where audit_id = $1",
    [id],
  );
  if (n === 0) throw new ValidationError("Add at least one process before presenting the audit");
  if (classified < n) throw new ValidationError("Classify every process before presenting the audit");
  const presentedAt = optDate(input.presentation_at, "Presentation date") ?? new Date();
  const deliverable = optUrl(input.deliverable_url, "Deliverable link") ?? audit.deliverable_url;
  await ctx.db.transaction(async (tx) => {
    await tx.query("update audits set status = 'PRESENTED', presentation_at = $2, deliverable_url = $3, updated_at = now() where id = $1", [id, presentedAt, deliverable]);
    await logAudit(tx, ctx.user, "audit", id, "status_change", { status: audit.status }, { status: "PRESENTED", presentation_at: presentedAt });
    if (audit.opportunity_id) {
      await tx.query("update opportunities set next_action = 'Send pilot/deployment proposal', next_action_at = now() + interval '3 days', updated_at = now() where id = $1", [audit.opportunity_id]);
    }
    await autoAdvance(tx, ctx.user, audit.opportunity_id, "AUDIT_IN_PROGRESS", "AUDIT_PRESENTED");
  });
}

export async function cancelAudit(ctx: Ctx, id: string) {
  if (ctx.user.role !== "ADMIN_MANAGER") throw new ForbiddenError();
  const audit = await getAudit(ctx, id);
  if (audit.status === "CANCELLED") return;
  await ctx.db.transaction(async (tx) => {
    await tx.query("update audits set status = 'CANCELLED', updated_at = now() where id = $1", [id]);
    await logAudit(tx, ctx.user, "audit", id, "status_change", { status: audit.status }, { status: "CANCELLED" });
  });
}

export async function updateAuditDiscovery(ctx: Ctx, id: string, input: Record<string, unknown>) {
  requireCap(ctx.user, "audit.write");
  const audit = await getAudit(ctx, id);
  const f = {
    business_goals: optStr(input.business_goals, 8000),
    team_summary: optStr(input.team_summary, 8000),
    systems_summary: optStr(input.systems_summary, 8000),
    executive_summary: optStr(input.executive_summary, 12000),
    roadmap_90_day: optStr(input.roadmap_90_day, 12000),
    deliverable_url: optUrl(input.deliverable_url, "Deliverable link"),
    owner_user_id: input.owner_user_id === undefined ? audit.owner_user_id : await resolveAuditOwner(ctx.db, input.owner_user_id),
  };
  await ctx.db.transaction(async (tx) => {
    await tx.query(
      `update audits set business_goals=$2, team_summary=$3, systems_summary=$4, executive_summary=$5, roadmap_90_day=$6, deliverable_url=$7, owner_user_id=$8, updated_at=now() where id=$1`,
      [id, f.business_goals, f.team_summary, f.systems_summary, f.executive_summary, f.roadmap_90_day, f.deliverable_url, f.owner_user_id],
    );
    await logAudit(tx, ctx.user, "audit", id, "update_discovery", null, { owner_user_id: f.owner_user_id });
  });
}

// ---------------------------------------------------------------------------
// Process inventory & classification
// ---------------------------------------------------------------------------
export interface ProcessRow {
  id: string;
  audit_id: string;
  name: string;
  process_owner: string | null;
  frequency: string | null;
  monthly_volume: number | null;
  monthly_hours: number | null;
  loaded_hourly_cost_cents: number | null;
  inputs: string | null;
  outputs: string | null;
  systems: string[];
  exceptions: string | null;
  risk_notes: string | null;
  judgment_level: number | null;
  error_consequence_notes: string | null;
  classification: Classification | null;
}

function processFields(input: Record<string, unknown>) {
  const cost = input.loaded_hourly_cost_cents;
  const costCents = cost === undefined || cost === null || cost === "" ? null : Number(cost);
  if (costCents !== null && (!Number.isSafeInteger(costCents) || costCents < 0)) throw new ValidationError("Loaded hourly cost must be a non-negative amount");
  return {
    name: reqStr(input.name, "Process name", 200),
    process_owner: optStr(input.process_owner, 200),
    frequency: optStr(input.frequency, 120),
    monthly_volume: optNum(input.monthly_volume, "Monthly volume", { min: 0 }),
    monthly_hours: optNum(input.monthly_hours, "Monthly hours", { min: 0 }),
    loaded_hourly_cost_cents: costCents,
    inputs: optStr(input.inputs, 4000),
    outputs: optStr(input.outputs, 4000),
    systems: optList(input.systems),
    exceptions: optStr(input.exceptions, 4000),
    risk_notes: optStr(input.risk_notes, 4000),
    judgment_level: optNum(input.judgment_level, "Judgment level", { min: 1, max: 5, int: true }),
    error_consequence_notes: optStr(input.error_consequence_notes, 4000),
    classification: optOneOf(input.classification, CLASSIFICATIONS, "classification"),
  };
}

async function assertAuditEditable(ctx: Ctx, auditId: string) {
  const audit = await getAudit(ctx, auditId);
  if (audit.status === "CANCELLED") throw new ValidationError("Audit is cancelled");
  return audit;
}

export async function addProcess(ctx: Ctx, auditId: string, input: Record<string, unknown>) {
  requireCap(ctx.user, "audit.write");
  await assertAuditEditable(ctx, auditId);
  const f = processFields(input);
  return ctx.db.transaction(async (tx) => {
    const [row] = await tx.query<{ id: string }>(
      `insert into processes(audit_id, name, process_owner, frequency, monthly_volume, monthly_hours, loaded_hourly_cost_cents, inputs, outputs,
         systems, exceptions, risk_notes, judgment_level, error_consequence_notes, classification)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning id`,
      [auditId, f.name, f.process_owner, f.frequency, f.monthly_volume, f.monthly_hours, f.loaded_hourly_cost_cents, f.inputs, f.outputs,
        f.systems, f.exceptions, f.risk_notes, f.judgment_level, f.error_consequence_notes, f.classification],
    );
    await logAudit(tx, ctx.user, "process", row.id, "create", null, f);
    return row.id;
  });
}

export async function getProcess(ctx: Ctx, id: string) {
  requireCap(ctx.user, "audit.read");
  const [p] = await ctx.db.query<ProcessRow>("select * from processes where id = $1", [id]);
  assertFound(p, "Process");
  const audit = await getAudit(ctx, p.audit_id); // visibility through the audit's company
  return { process: p, audit };
}

export async function updateProcess(ctx: Ctx, id: string, input: Record<string, unknown>) {
  requireCap(ctx.user, "audit.write");
  const { process: before } = await getProcess(ctx, id);
  await assertAuditEditable(ctx, before.audit_id);
  const f = processFields(input);
  await ctx.db.transaction(async (tx) => {
    await tx.query(
      `update processes set name=$2, process_owner=$3, frequency=$4, monthly_volume=$5, monthly_hours=$6, loaded_hourly_cost_cents=$7, inputs=$8,
         outputs=$9, systems=$10, exceptions=$11, risk_notes=$12, judgment_level=$13, error_consequence_notes=$14, classification=$15, updated_at=now()
       where id=$1`,
      [id, f.name, f.process_owner, f.frequency, f.monthly_volume, f.monthly_hours, f.loaded_hourly_cost_cents, f.inputs, f.outputs, f.systems,
        f.exceptions, f.risk_notes, f.judgment_level, f.error_consequence_notes, f.classification],
    );
    if (f.classification !== before.classification) {
      await logAudit(tx, ctx.user, "process", id, "classify", { classification: before.classification }, { classification: f.classification });
    }
    await logAudit(tx, ctx.user, "process", id, "update", null, f);
  });
}

// ---------------------------------------------------------------------------
// Agentic Opportunity Score
// ---------------------------------------------------------------------------
export async function getActiveWeights(db: Queryable): Promise<{ version: string; weights: Weights }> {
  const [row] = await db.query<{ version: string; weights: Weights }>("select version, weights from scoring_weight_sets where active");
  if (!row) throw new ValidationError("No active scoring weight set configured");
  return { version: row.version, weights: validateWeights(row.weights) };
}

export interface ProcessScoreRow extends RawScores {
  id: string;
  process_id: string;
  weights: Weights;
  calculated_score: number;
  scoring_version: string;
  created_at: Date;
}

/** Stores raw dimension scores + the weights/version used + the calculated total (append-only). */
export async function scoreProcess(ctx: Ctx, processId: string, input: Record<string, unknown>) {
  requireCap(ctx.user, "audit.write");
  const { process } = await getProcess(ctx, processId);
  await assertAuditEditable(ctx, process.audit_id);
  const raw = validateRawScores(input);
  return ctx.db.transaction(async (tx) => {
    const { version, weights } = await getActiveWeights(tx);
    const result = calculateScore(raw, weights);
    const [row] = await tx.query<{ id: string }>(
      `insert into process_scores(process_id, economic_impact, frequency_volume, repetitiveness, data_availability, rule_clarity,
         human_judgment_required, error_consequence, implementation_difficulty, time_to_value, weights, calculated_score, scoring_version, scored_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id`,
      [processId, raw.economic_impact, raw.frequency_volume, raw.repetitiveness, raw.data_availability, raw.rule_clarity,
        raw.human_judgment_required, raw.error_consequence, raw.implementation_difficulty, raw.time_to_value,
        JSON.stringify(weights), result.total, version, ctx.user.id],
    );
    await logAudit(tx, ctx.user, "process_score", row.id, "score", null, { processId, raw, weights_version: version, total: result.total });
    return { id: row.id, total: result.total };
  });
}

// ---------------------------------------------------------------------------
// ROI scenarios (append-only versions; historical assumptions are never overwritten)
// ---------------------------------------------------------------------------
export interface RoiScenarioRow {
  id: string;
  scenario_key: string;
  version: number;
  audit_id: string;
  process_id: string | null;
  name: string;
  model_version: string;
  currency: string;
  assumptions: Record<string, unknown>;
  monthly_value_low_cents: number;
  monthly_value_high_cents: number;
  annual_value_low_cents: number;
  annual_value_high_cents: number;
  implementation_cost_cents: number;
  payback_months_low: number | null;
  payback_months_high: number | null;
  roi_low: number | null;
  roi_high: number | null;
  created_by_name?: string | null;
  created_at: Date;
}

export async function saveRoiScenario(ctx: Ctx, auditId: string, input: { scenario_key?: unknown; name?: unknown; process_id?: unknown; assumptions: unknown }) {
  requireCap(ctx.user, "audit.write");
  const audit = await assertAuditEditable(ctx, auditId);
  const name = reqStr(input.name, "Scenario name", 200);
  const processId = optStr(input.process_id, 64);
  if (processId) {
    const [p] = await ctx.db.query("select 1 from processes where id = $1 and audit_id = $2", [processId, auditId]);
    if (!p) throw new ValidationError("Process does not belong to this audit");
  }
  const assumptions = parseRoiAssumptions(input.assumptions);
  const result = calculateRoi(assumptions);
  const scenarioKey = optStr(input.scenario_key, 64);
  return ctx.db.transaction(async (tx) => {
    let version = 1;
    let key: string = randomUUID();
    if (scenarioKey) {
      const [prev] = await tx.query<{ v: number }>("select max(version)::int as v from roi_scenarios where scenario_key = $1 and audit_id = $2", [scenarioKey, auditId]);
      if (!prev?.v) throw new ValidationError("Scenario not found for this audit");
      version = prev.v + 1;
      key = scenarioKey;
    }
    const [row] = await tx.query<{ id: string }>(
      `insert into roi_scenarios(scenario_key, version, audit_id, process_id, name, model_version, currency, assumptions,
         monthly_value_low_cents, monthly_value_high_cents, annual_value_low_cents, annual_value_high_cents, implementation_cost_cents,
         payback_months_low, payback_months_high, roi_low, roi_high, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) returning id`,
      [key, version, auditId, processId, name, ROI_MODEL_VERSION, audit.currency, JSON.stringify(assumptions),
        result.monthly_value_low_cents, result.monthly_value_high_cents, result.annual_value_low_cents, result.annual_value_high_cents,
        result.implementation_cost_cents, result.payback_months_low, result.payback_months_high, result.roi_low, result.roi_high, ctx.user.id],
    );
    await logAudit(tx, ctx.user, "roi_scenario", row.id, version === 1 ? "create" : "new_version", null, { scenario_key: key, version, assumptions, result });
    return { id: row.id, scenarioKey: key, version };
  });
}

// ---------------------------------------------------------------------------
// Agentic opportunities & recommended pilot
// ---------------------------------------------------------------------------
export interface AgenticOpportunityRow {
  id: string;
  process_id: string;
  process_name: string;
  classification: Classification | null;
  proposed_responsibility: string;
  expected_benefit: string | null;
  risk_level: string | null;
  difficulty_level: string | null;
  priority: string | null;
  roi_scenario_id: string | null;
  recommended_for_pilot: boolean;
  regulated_boundary_ack: boolean;
  latest_score: number | null;
}

export async function createAgenticOpportunity(ctx: Ctx, processId: string, input: Record<string, unknown>) {
  requireCap(ctx.user, "audit.write");
  const { process, audit } = await getProcess(ctx, processId);
  await assertAuditEditable(ctx, audit.id);
  if (!process.classification) throw new ValidationError("Classify the process before defining an agentic opportunity");
  if (process.classification === "HUMAN_ONLY") throw new ValidationError("Human-only processes cannot become agentic opportunities");
  const ack = bool(input.regulated_boundary_ack);
  if (audit.regulated && !ack) {
    throw new ValidationError("Regulated vertical: confirm the responsibility is administrative/operational only (no legal, clinical or other professional judgment)");
  }
  const roiId = optStr(input.roi_scenario_id, 64);
  if (roiId) {
    const [r] = await ctx.db.query("select 1 from roi_scenarios where id = $1 and audit_id = $2", [roiId, audit.id]);
    if (!r) throw new ValidationError("ROI scenario does not belong to this audit");
  }
  const levels = ["LOW", "MEDIUM", "HIGH"] as const;
  const f = {
    proposed_responsibility: reqStr(input.proposed_responsibility, "Proposed responsibility", 2000),
    expected_benefit: optStr(input.expected_benefit, 2000),
    risk_level: optOneOf(input.risk_level, levels, "risk level"),
    difficulty_level: optOneOf(input.difficulty_level, levels, "difficulty level"),
    priority: optOneOf(input.priority, ["P1", "P2", "P3"] as const, "priority"),
    roi_scenario_id: roiId,
    regulated_boundary_ack: ack,
  };
  return ctx.db.transaction(async (tx) => {
    const [row] = await tx.query<{ id: string }>(
      `insert into agentic_opportunities(process_id, proposed_responsibility, expected_benefit, risk_level, difficulty_level, priority, roi_scenario_id, regulated_boundary_ack)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
      [processId, f.proposed_responsibility, f.expected_benefit, f.risk_level, f.difficulty_level, f.priority, f.roi_scenario_id, f.regulated_boundary_ack],
    );
    await logAudit(tx, ctx.user, "agentic_opportunity", row.id, "create", null, f);
    return row.id;
  });
}

export async function getAgenticOpportunity(ctx: Ctx, id: string) {
  requireCap(ctx.user, "audit.read");
  const [row] = await ctx.db.query<AgenticOpportunityRow & { audit_id: string }>(
    `select ao.*, p.name as process_name, p.classification, p.audit_id,
       (select ps.calculated_score from process_scores ps where ps.process_id = p.id order by ps.created_at desc limit 1) as latest_score
     from agentic_opportunities ao join processes p on p.id = ao.process_id where ao.id = $1`,
    [id],
  );
  assertFound(row, "Agentic opportunity");
  const audit = await getAudit(ctx, row.audit_id);
  return { ao: row, audit };
}

/** One recommended pilot per audit; it must come from an Agent-ready, scored process. */
export async function setRecommendedPilot(ctx: Ctx, agenticOpportunityId: string) {
  requireCap(ctx.user, "audit.write");
  const { ao, audit } = await getAgenticOpportunity(ctx, agenticOpportunityId);
  if (ao.classification !== "AGENT_READY") throw new ValidationError("A recommended pilot must come from an Agent-ready process");
  if (ao.latest_score === null) throw new ValidationError("Score the process before recommending it as the pilot");
  await ctx.db.transaction(async (tx) => {
    await tx.query(
      `update agentic_opportunities set recommended_for_pilot = false
       where process_id in (select id from processes where audit_id = $1) and recommended_for_pilot`,
      [audit.id],
    );
    await tx.query("update agentic_opportunities set recommended_for_pilot = true where id = $1", [agenticOpportunityId]);
    await logAudit(tx, ctx.user, "agentic_opportunity", agenticOpportunityId, "recommend_pilot", null, { audit_id: audit.id });
  });
}

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------
export async function getAuditWorkspace(ctx: Ctx, id: string) {
  const audit = await getAudit(ctx, id);
  const db = ctx.db;
  const processes = await db.query<ProcessRow>("select * from processes where audit_id = $1 order by created_at", [id]);
  const scores = await db.query<ProcessScoreRow>(
    `select distinct on (ps.process_id) ps.* from process_scores ps join processes p on p.id = ps.process_id
     where p.audit_id = $1 order by ps.process_id, ps.created_at desc`,
    [id],
  );
  const scoreHistoryCounts = await db.query<{ process_id: string; n: number }>(
    "select ps.process_id, count(*)::int as n from process_scores ps join processes p on p.id = ps.process_id where p.audit_id = $1 group by ps.process_id",
    [id],
  );
  const agenticOpportunities = await db.query<AgenticOpportunityRow>(
    `select ao.*, p.name as process_name, p.classification,
       (select ps.calculated_score from process_scores ps where ps.process_id = p.id order by ps.created_at desc limit 1) as latest_score
     from agentic_opportunities ao join processes p on p.id = ao.process_id where p.audit_id = $1
     order by ao.recommended_for_pilot desc, latest_score desc nulls last`,
    [id],
  );
  const roiVersions = await db.query<RoiScenarioRow>(
    `select r.*, u.full_name as created_by_name from roi_scenarios r left join app_users u on u.id = r.created_by
     where r.audit_id = $1 order by r.scenario_key, r.version desc`,
    [id],
  );
  const proposals = await db.query<{ id: string; title: string; status: string; proposal_type: string; agentic_opportunity_id: string | null }>(
    "select id, title, status, proposal_type, agentic_opportunity_id from proposals where audit_id = $1 order by created_at desc",
    [id],
  );
  const scoreByProcess = new Map(scores.map((s) => [s.process_id, s]));
  const latestRoi = new Map<string, RoiScenarioRow>();
  for (const r of roiVersions) if (!latestRoi.has(r.scenario_key)) latestRoi.set(r.scenario_key, r);
  const scored = scores.map((s) => Number(s.calculated_score));
  const overallScore = scored.length ? Math.round((scored.reduce((a, b) => a + b, 0) / scored.length) * 100) / 100 : null;
  const classificationCounts = Object.fromEntries(CLASSIFICATIONS.map((c) => [c, processes.filter((p) => p.classification === c).length]));
  return {
    audit,
    processes: processes.map((p) => {
      const s = scoreByProcess.get(p.id) ?? null;
      return { ...p, score: s, scoreVersions: scoreHistoryCounts.find((c) => c.process_id === p.id)?.n ?? 0, riskFlags: s ? riskFlags(s) : [] };
    }),
    agenticOpportunities,
    roiScenarios: [...latestRoi.values()],
    roiVersions,
    proposals,
    overallScore,
    classificationCounts,
    weights: await getActiveWeights(db),
  };
}

export async function getProcessScoreHistory(ctx: Ctx, processId: string) {
  await getProcess(ctx, processId);
  return ctx.db.query<ProcessScoreRow>("select * from process_scores where process_id = $1 order by created_at desc", [processId]);
}

/** Recompute a stored score from its stored raw values and stored weights (reproducibility check). */
export function recomputeStoredScore(row: ProcessScoreRow): number {
  return calculateScore(row, row.weights).total;
}

export const AUDIT_STATUS_LABEL: Record<string, string> = {
  OFFERED: "Offered",
  PAID: "Paid",
  IN_PROGRESS: "In progress",
  PRESENTED: "Presented",
  CANCELLED: "Cancelled",
};

export function classificationLabel(c: string | null) {
  return c ? { HUMAN_ONLY: "Human only", AUTOMATE: "Automate", AGENT_READY: "Agent-ready", REDESIGN_FIRST: "Redesign first" }[c] ?? c : "Unclassified";
}

