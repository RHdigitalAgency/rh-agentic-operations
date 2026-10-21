import type { Queryable } from "@/lib/db/types";
import { can, requireCap } from "@/lib/auth/user";
import { assertFound, ForbiddenError, ValidationError } from "@/lib/errors";
import { bool, oneOf, optDay, optList, optNum, optStr, optUrl, reqNum, reqStr, todayLocal } from "@/lib/validate";
import { deliveryCostCents, grossMargin } from "@/domain/money";
import { compareKpis, type KpiRow } from "@/domain/kpi";
import { companyVisible, logAudit, Sql, type Ctx } from "./context";
import { getInternalHourlyCostCents } from "./settings";

export const DEPLOYMENT_STATUSES = ["PLANNED", "BUILD", "QA", "LAUNCHED", "MONITORING", "COMPLETED", "PAUSED", "CANCELLED"] as const;
export type DeploymentStatus = (typeof DEPLOYMENT_STATUSES)[number];

const FLOW: Record<DeploymentStatus, DeploymentStatus[]> = {
  PLANNED: ["BUILD", "PAUSED", "CANCELLED"],
  BUILD: ["QA", "PAUSED", "CANCELLED"],
  QA: ["BUILD", "LAUNCHED", "PAUSED", "CANCELLED"],
  LAUNCHED: ["MONITORING", "PAUSED", "CANCELLED"],
  MONITORING: ["COMPLETED", "PAUSED", "CANCELLED"],
  COMPLETED: [],
  PAUSED: ["PLANNED", "BUILD", "QA", "LAUNCHED", "MONITORING", "CANCELLED"],
  CANCELLED: [],
};

export interface DeploymentRow {
  id: string;
  company_id: string;
  company_name: string;
  vertical: string | null;
  regulated: boolean;
  proposal_id: string | null;
  proposal_title: string | null;
  proposal_type: string | null;
  revenue_cents: number | null;
  currency: string | null;
  opportunity_id: string | null;
  name: string;
  status: DeploymentStatus;
  scope_included: string | null;
  scope_excluded: string | null;
  integrations: string | null;
  start_date: string | null;
  end_date: string | null;
  launch_date: string | null;
  launch_version: string | null;
  monitoring_until: string | null;
  owner_user_id: string | null;
  owner_name: string | null;
  reusable_components: number;
  total_components: number;
  reusable_assets_notes: string | null;
  before_narrative: string | null;
  intervention_summary: string | null;
  after_narrative: string | null;
  lessons: string | null;
  client_approval_status: string;
  hours: number;
  direct_cost_cents: number;
  created_at: Date;
}

const SELECT = `
  select d.*, c.name as company_name, c.vertical, coalesce(v.regulated,false) as regulated,
    p.title as proposal_title, p.proposal_type, p.amount_cents as revenue_cents, p.currency, p.opportunity_id,
    u.full_name as owner_name,
    coalesce((select sum(e.hours) from deployment_effort_entries e where e.deployment_id = d.id), 0) as hours,
    coalesce((select sum(e.direct_cost_cents) from deployment_effort_entries e where e.deployment_id = d.id), 0) as direct_cost_cents
  from deployments d join companies c on c.id = d.company_id
  left join ref_verticals v on v.code = c.vertical
  left join proposals p on p.id = d.proposal_id
  left join app_users u on u.id = d.owner_user_id`;

export async function listDeployments(ctx: Ctx, f: { status?: string; mine?: boolean } = {}) {
  requireCap(ctx.user, "delivery.read");
  const q = new Sql();
  const where = [companyVisible(q, ctx.user, "c")];
  if (f.status) where.push(`d.status = ${q.p(f.status)}`);
  if (f.mine) where.push(`d.owner_user_id = ${q.p(ctx.user.id)}`);
  return ctx.db.query<DeploymentRow>(`${SELECT} where ${where.join(" and ")} order by d.created_at desc`, q.params);
}

export async function getDeployment(ctx: Ctx, id: string, db: Queryable = ctx.db): Promise<DeploymentRow> {
  requireCap(ctx.user, "delivery.read");
  const q = new Sql();
  const [row] = await db.query<DeploymentRow>(`${SELECT} where d.id = ${q.p(id)} and ${companyVisible(q, ctx.user, "c")}`, q.params);
  return assertFound(row, "Deployment");
}

/** Delivery users may only modify deployments they own; managers may modify any. */
async function getWritableDeployment(ctx: Ctx, id: string) {
  requireCap(ctx.user, "delivery.write");
  const d = await getDeployment(ctx, id);
  if (ctx.user.role !== "ADMIN_MANAGER" && d.owner_user_id !== ctx.user.id) throw new ForbiddenError("Only the deployment owner or a manager can change this deployment");
  return d;
}

export async function updateDeployment(ctx: Ctx, id: string, input: Record<string, unknown>) {
  const d = await getWritableDeployment(ctx, id);
  const reusable = optNum(input.reusable_components, "Reusable components", { min: 0, int: true }) ?? 0;
  const total = optNum(input.total_components, "Total components", { min: 0, int: true }) ?? 0;
  if (reusable > total) throw new ValidationError("Reusable components cannot exceed total components");
  let owner = d.owner_user_id;
  if (input.owner_user_id !== undefined && ctx.user.role === "ADMIN_MANAGER") {
    owner = optStr(input.owner_user_id, 64);
    if (owner) {
      const [u] = await ctx.db.query<{ role: string }>("select role from app_users where id = $1 and active", [owner]);
      if (!u || !["DELIVERY", "ADMIN_MANAGER"].includes(u.role)) throw new ValidationError("Owner must be an active delivery user or manager");
    }
  }
  const f = {
    name: reqStr(input.name, "Name", 200),
    scope_included: optStr(input.scope_included, 8000),
    scope_excluded: optStr(input.scope_excluded, 8000),
    integrations: optStr(input.integrations, 4000),
    start_date: optDay(input.start_date, "Start date"),
    end_date: optDay(input.end_date, "End date"),
    launch_version: optStr(input.launch_version, 60),
    monitoring_until: optDay(input.monitoring_until, "Monitoring until"),
    reusable_components: reusable,
    total_components: total,
    reusable_assets_notes: optStr(input.reusable_assets_notes, 4000),
    before_narrative: optStr(input.before_narrative, 8000),
    intervention_summary: optStr(input.intervention_summary, 8000),
    after_narrative: optStr(input.after_narrative, 8000),
    lessons: optStr(input.lessons, 8000),
    client_approval_status: input.client_approval_status
      ? oneOf(input.client_approval_status, ["NOT_REQUESTED", "PENDING", "APPROVED", "DENIED"] as const, "client approval status")
      : d.client_approval_status,
    owner_user_id: owner,
  };
  await ctx.db.transaction(async (tx) => {
    await tx.query(
      `update deployments set name=$2, scope_included=$3, scope_excluded=$4, integrations=$5, start_date=$6, end_date=$7, launch_version=$8,
         monitoring_until=$9, reusable_components=$10, total_components=$11, reusable_assets_notes=$12, before_narrative=$13,
         intervention_summary=$14, after_narrative=$15, lessons=$16, client_approval_status=$17, owner_user_id=$18, updated_at=now() where id=$1`,
      [id, f.name, f.scope_included, f.scope_excluded, f.integrations, f.start_date, f.end_date, f.launch_version, f.monitoring_until,
        f.reusable_components, f.total_components, f.reusable_assets_notes, f.before_narrative, f.intervention_summary, f.after_narrative,
        f.lessons, f.client_approval_status, f.owner_user_id],
    );
    await logAudit(tx, ctx.user, "deployment", id, "update", { owner_user_id: d.owner_user_id, client_approval_status: d.client_approval_status }, f);
  });
}

/** Launch readiness: every agent role has a full control model, QA exists and passed, rollback is ready. */
export async function launchReadiness(db: Queryable, deploymentId: string): Promise<string[]> {
  const problems: string[] = [];
  const roles = await db.query<AgentRoleRow>("select * from agent_roles where deployment_id = $1", [deploymentId]);
  if (roles.length === 0) problems.push("Define at least one agent role");
  for (const r of roles) {
    const missing = controlGaps(r);
    if (missing.length) problems.push(`Agent role "${r.name}" is missing: ${missing.join(", ")}`);
  }
  const qa = await db.query<{ status: string; rollback_ready: boolean }>("select status, rollback_ready from qa_items where deployment_id = $1", [deploymentId]);
  if (qa.length === 0) problems.push("Add QA test cases");
  if (qa.some((x) => x.status !== "PASSED")) problems.push("All QA items must pass");
  if (!qa.some((x) => x.rollback_ready)) problems.push("Confirm rollback readiness on at least one QA item");
  return problems;
}

export async function changeDeploymentStatus(ctx: Ctx, id: string, statusInput: unknown) {
  const d = await getWritableDeployment(ctx, id);
  const to = oneOf(statusInput, DEPLOYMENT_STATUSES, "status");
  if (!FLOW[d.status].includes(to)) throw new ValidationError(`Cannot move deployment from ${d.status} to ${to}`);
  if (to === "LAUNCHED") {
    const problems = await launchReadiness(ctx.db, id);
    if (problems.length) throw new ValidationError(`Not ready to launch: ${problems.join("; ")}`);
  }
  await ctx.db.transaction(async (tx) => {
    await tx.query(
      `update deployments set status = $2, launch_date = case when $2 = 'LAUNCHED' and launch_date is null then current_date else launch_date end,
         end_date = case when $2 in ('COMPLETED','CANCELLED') and end_date is null then current_date else end_date end, updated_at = now() where id = $1`,
      [id, to],
    );
    await logAudit(tx, ctx.user, "deployment", id, "status_change", { status: d.status }, { status: to });
  });
}

// ---------------------------------------------------------------------------
// Agent roles & control model
// ---------------------------------------------------------------------------
export interface AgentRoleRow {
  id: string;
  deployment_id: string;
  name: string;
  responsibility: string;
  allowed_actions: string | null;
  prohibited_actions: string | null;
  approval_requirements: string | null;
  escalation_owner: string | null;
  exception_handling: string | null;
  tools: string[];
  access_method: string | null;
  logging_monitoring: string | null;
  rollback_procedure: string | null;
  owner_name: string | null;
  provider: string | null;
  provider_metadata: Record<string, unknown>;
}

/** Security baseline §"Agent deployment controls": every role must define these before launch. */
export function controlGaps(r: Pick<AgentRoleRow, "allowed_actions" | "prohibited_actions" | "approval_requirements" | "escalation_owner" | "tools" | "rollback_procedure" | "logging_monitoring">): string[] {
  const gaps: string[] = [];
  if (!r.allowed_actions) gaps.push("allowed actions");
  if (!r.prohibited_actions) gaps.push("prohibited actions");
  if (!r.approval_requirements) gaps.push("approval requirements");
  if (!r.escalation_owner) gaps.push("escalation owner");
  if (!r.tools?.length) gaps.push("tools/systems");
  if (!r.logging_monitoring) gaps.push("logging/monitoring");
  if (!r.rollback_procedure) gaps.push("rollback/disable procedure");
  return gaps;
}

export const REGULATED_PROHIBITED_TEMPLATE: Record<string, string> = {
  LEGAL_ADMIN:
    "No legal advice. No legal strategy. No interpretation of law for the client. No substantive legal recommendations. No autonomous regulated filings or decisions. Status updates only from authoritative recorded information; escalate uncertainty to an authorized attorney/paralegal.",
  DENTAL_ADMIN:
    "No diagnosis. No clinical advice. No symptom interpretation. No treatment recommendations. No clinical judgment. Status updates only from authoritative recorded information; escalate clinical questions to licensed staff.",
};

const REGULATED_REQUIRED_PHRASES: Record<string, RegExp> = {
  LEGAL_ADMIN: /legal advice/i,
  DENTAL_ADMIN: /(diagnos|clinical advice)/i,
};

function roleFields(input: Record<string, unknown>) {
  let metadata: Record<string, unknown> = {};
  const rawMeta = optStr(input.provider_metadata, 8000);
  if (rawMeta) {
    try {
      const parsed = JSON.parse(rawMeta);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error();
      metadata = parsed;
    } catch {
      throw new ValidationError("Provider metadata must be a JSON object");
    }
  }
  return {
    name: reqStr(input.name, "Role name", 200),
    responsibility: reqStr(input.responsibility, "Responsibility", 4000),
    allowed_actions: optStr(input.allowed_actions, 4000),
    prohibited_actions: optStr(input.prohibited_actions, 4000),
    approval_requirements: optStr(input.approval_requirements, 4000),
    escalation_owner: optStr(input.escalation_owner, 200),
    exception_handling: optStr(input.exception_handling, 4000),
    tools: optList(input.tools),
    access_method: optStr(input.access_method, 1000),
    logging_monitoring: optStr(input.logging_monitoring, 2000),
    rollback_procedure: optStr(input.rollback_procedure, 2000),
    owner_name: optStr(input.owner_name, 200),
    provider: optStr(input.provider, 80),
    provider_metadata: metadata,
  };
}

function assertRegulatedBoundary(d: DeploymentRow, f: { prohibited_actions: string | null }) {
  if (!d.regulated || !d.vertical) return;
  const re = REGULATED_REQUIRED_PHRASES[d.vertical];
  if (!f.prohibited_actions || (re && !re.test(f.prohibited_actions))) {
    throw new ValidationError(
      "Regulated vertical: prohibited actions must explicitly exclude professional judgment (e.g. legal advice / diagnosis). Use the provided template.",
    );
  }
}

export async function addAgentRole(ctx: Ctx, deploymentId: string, input: Record<string, unknown>) {
  const d = await getWritableDeployment(ctx, deploymentId);
  const f = roleFields(input);
  assertRegulatedBoundary(d, f);
  return ctx.db.transaction(async (tx) => {
    const [row] = await tx.query<{ id: string }>(
      `insert into agent_roles(deployment_id, name, responsibility, allowed_actions, prohibited_actions, approval_requirements, escalation_owner,
         exception_handling, tools, access_method, logging_monitoring, rollback_procedure, owner_name, provider, provider_metadata)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning id`,
      [deploymentId, f.name, f.responsibility, f.allowed_actions, f.prohibited_actions, f.approval_requirements, f.escalation_owner,
        f.exception_handling, f.tools, f.access_method, f.logging_monitoring, f.rollback_procedure, f.owner_name, f.provider, JSON.stringify(f.provider_metadata)],
    );
    await logAudit(tx, ctx.user, "agent_role", row.id, "create", null, f);
    return row.id;
  });
}

export async function updateAgentRole(ctx: Ctx, roleId: string, input: Record<string, unknown>) {
  const [r] = await ctx.db.query<{ deployment_id: string }>("select deployment_id from agent_roles where id = $1", [roleId]);
  assertFound(r, "Agent role");
  const d = await getWritableDeployment(ctx, r.deployment_id);
  const f = roleFields(input);
  assertRegulatedBoundary(d, f);
  await ctx.db.transaction(async (tx) => {
    const [before] = await tx.query("select * from agent_roles where id = $1", [roleId]);
    await tx.query(
      `update agent_roles set name=$2, responsibility=$3, allowed_actions=$4, prohibited_actions=$5, approval_requirements=$6, escalation_owner=$7,
         exception_handling=$8, tools=$9, access_method=$10, logging_monitoring=$11, rollback_procedure=$12, owner_name=$13, provider=$14,
         provider_metadata=$15, updated_at=now() where id=$1`,
      [roleId, f.name, f.responsibility, f.allowed_actions, f.prohibited_actions, f.approval_requirements, f.escalation_owner, f.exception_handling,
        f.tools, f.access_method, f.logging_monitoring, f.rollback_procedure, f.owner_name, f.provider, JSON.stringify(f.provider_metadata)],
    );
    await logAudit(tx, ctx.user, "agent_role", roleId, "update", before, f);
  });
}

// ---------------------------------------------------------------------------
// QA
// ---------------------------------------------------------------------------
export async function addQaItem(ctx: Ctx, deploymentId: string, input: Record<string, unknown>) {
  await getWritableDeployment(ctx, deploymentId);
  const [row] = await ctx.db.query<{ id: string }>(
    "insert into qa_items(deployment_id, description, status, evidence_url, rollback_ready) values ($1,$2,'PENDING',$3,$4) returning id",
    [deploymentId, reqStr(input.description, "Test case", 2000), optUrl(input.evidence_url, "Evidence link"), bool(input.rollback_ready)],
  );
  return row.id;
}

export async function updateQaItem(ctx: Ctx, qaId: string, input: Record<string, unknown>) {
  const [qa] = await ctx.db.query<{ deployment_id: string; status: string }>("select deployment_id, status from qa_items where id = $1", [qaId]);
  assertFound(qa, "QA item");
  await getWritableDeployment(ctx, qa.deployment_id);
  const status = oneOf(input.status, ["PENDING", "PASSED", "FAILED"] as const, "QA status");
  const evidence = optUrl(input.evidence_url, "Evidence link");
  if (status === "PASSED" && !evidence) throw new ValidationError("Evidence link is required to mark a QA item as passed");
  await ctx.db.transaction(async (tx) => {
    await tx.query("update qa_items set status=$2, evidence_url=$3, rollback_ready=$4, updated_at=now() where id=$1", [qaId, status, evidence, bool(input.rollback_ready)]);
    await logAudit(tx, ctx.user, "qa_item", qaId, "update", { status: qa.status }, { status, evidence_url: evidence, rollback_ready: bool(input.rollback_ready) });
  });
}

// ---------------------------------------------------------------------------
// Effort (hours + direct cost) — gross margin is derived from these records
// ---------------------------------------------------------------------------
export async function addEffortEntry(ctx: Ctx, deploymentId: string, input: Record<string, unknown>) {
  await getWritableDeployment(ctx, deploymentId);
  const hours = optNum(input.hours, "Hours", { min: 0, max: 1000 }) ?? 0;
  const cost = input.direct_cost_cents === undefined || input.direct_cost_cents === "" || input.direct_cost_cents === null ? 0 : Number(input.direct_cost_cents);
  if (!Number.isSafeInteger(cost) || cost < 0) throw new ValidationError("Direct cost must be a non-negative amount");
  if (hours === 0 && cost === 0) throw new ValidationError("Enter hours and/or direct cost");
  const workDate = optDay(input.work_date, "Work date") ?? todayLocal();
  return ctx.db.transaction(async (tx) => {
    const [row] = await tx.query<{ id: string }>(
      "insert into deployment_effort_entries(deployment_id, work_date, hours, direct_cost_cents, description, user_id) values ($1,$2,$3,$4,$5,$6) returning id",
      [deploymentId, workDate, hours, cost, optStr(input.description, 1000), ctx.user.id],
    );
    await logAudit(tx, ctx.user, "effort_entry", row.id, "create", null, { deploymentId, workDate, hours, direct_cost_cents: cost });
    return row.id;
  });
}

// ---------------------------------------------------------------------------
// KPI baseline / target / result measurements
// ---------------------------------------------------------------------------
function kpiFields(input: Record<string, unknown>) {
  const type = oneOf(input.measurement_type, ["BASELINE", "TARGET", "RESULT"] as const, "measurement type");
  const windowStart = optDay(input.window_start, "Window start");
  const windowEnd = optDay(input.window_end, "Window end");
  if (type !== "TARGET" && (!windowStart || !windowEnd)) throw new ValidationError("Baseline and result measurements need a measurement window");
  if (windowStart && windowEnd && windowStart > windowEnd) throw new ValidationError("Window start must be before window end");
  const benefit = input.benefit_monthly_cents === undefined || input.benefit_monthly_cents === "" || input.benefit_monthly_cents === null ? null : Number(input.benefit_monthly_cents);
  if (benefit !== null && (!Number.isSafeInteger(benefit) || benefit < 0)) throw new ValidationError("Monthly benefit must be a non-negative amount");
  if (benefit !== null && type !== "RESULT") throw new ValidationError("Monetized benefit applies to result measurements only");
  const key = reqStr(input.metric_key, "Metric", 80).toLowerCase().replace(/\s+/g, "_");
  if (!/^[a-z0-9_]+$/.test(key)) throw new ValidationError("Metric key may contain letters, digits and underscores only");
  return {
    metric_key: key,
    unit: reqStr(input.unit, "Unit", 40),
    measurement_type: type,
    value: reqNum(input.value, "Value"),
    window_start: windowStart,
    window_end: windowEnd,
    benefit_monthly_cents: benefit,
    notes: optStr(input.notes, 2000),
  };
}

export async function addKpiMeasurement(ctx: Ctx, deploymentId: string, input: Record<string, unknown>) {
  await getWritableDeployment(ctx, deploymentId);
  const f = kpiFields(input);
  return ctx.db.transaction(async (tx) => {
    const [row] = await tx.query<{ id: string }>(
      `insert into kpi_measurements(deployment_id, metric_key, unit, measurement_type, value, window_start, window_end, benefit_monthly_cents, notes, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
      [deploymentId, f.metric_key, f.unit, f.measurement_type, f.value, f.window_start, f.window_end, f.benefit_monthly_cents, f.notes, ctx.user.id],
    );
    await logAudit(tx, ctx.user, "kpi_measurement", row.id, "create", null, f);
    return row.id;
  });
}

export async function updateKpiMeasurement(ctx: Ctx, kpiId: string, input: Record<string, unknown>) {
  const [k] = await ctx.db.query<KpiRow & { deployment_id: string }>("select * from kpi_measurements where id = $1", [kpiId]);
  assertFound(k, "KPI measurement");
  await getWritableDeployment(ctx, k.deployment_id);
  const f = kpiFields(input);
  await ctx.db.transaction(async (tx) => {
    await tx.query(
      "update kpi_measurements set metric_key=$2, unit=$3, measurement_type=$4, value=$5, window_start=$6, window_end=$7, benefit_monthly_cents=$8, notes=$9 where id=$1",
      [kpiId, f.metric_key, f.unit, f.measurement_type, f.value, f.window_start, f.window_end, f.benefit_monthly_cents, f.notes],
    );
    await logAudit(tx, ctx.user, "kpi_measurement", kpiId, "update", k, f);
  });
}

// ---------------------------------------------------------------------------
// Workspace / case study
// ---------------------------------------------------------------------------
export async function getDeploymentWorkspace(ctx: Ctx, id: string) {
  const deployment = await getDeployment(ctx, id);
  const db = ctx.db;
  const roles = await db.query<AgentRoleRow>("select * from agent_roles where deployment_id = $1 order by created_at", [id]);
  const qa = await db.query<{ id: string; description: string; status: string; evidence_url: string | null; rollback_ready: boolean }>(
    "select * from qa_items where deployment_id = $1 order by created_at",
    [id],
  );
  const effort = await db.query<{ id: string; work_date: string; hours: number; direct_cost_cents: number; description: string | null; user_name: string | null }>(
    "select e.*, u.full_name as user_name from deployment_effort_entries e left join app_users u on u.id = e.user_id where e.deployment_id = $1 order by e.work_date desc, e.created_at desc",
    [id],
  );
  const kpis = await db.query<KpiRow>("select * from kpi_measurements where deployment_id = $1 order by metric_key, measurement_type, window_end nulls first, created_at", [id]);
  const rate = await getInternalHourlyCostCents(db);
  const canSeeFinancials = can(ctx.user, "financials.read") || (ctx.user.role === "DELIVERY" && deployment.owner_user_id === ctx.user.id);
  const cost = deliveryCostCents(Number(deployment.hours), rate, Number(deployment.direct_cost_cents));
  const revenue = deployment.revenue_cents ?? 0;
  const comparison = compareKpis(kpis);
  const monthlyBenefit = comparison.reduce((s, c) => s + (c.latestResult?.benefit_monthly_cents ?? 0), 0);
  return {
    deployment,
    roles: roles.map((r) => ({ ...r, gaps: controlGaps(r) })),
    qa,
    effort,
    kpis,
    comparison,
    readiness: await launchReadiness(db, id),
    canWrite: can(ctx.user, "delivery.write") && (ctx.user.role === "ADMIN_MANAGER" || deployment.owner_user_id === ctx.user.id),
    financials: canSeeFinancials
      ? {
          revenueCents: revenue,
          internalHourlyCostCents: rate,
          deliveryCostCents: cost,
          grossMargin: grossMargin(revenue, cost),
          monthlyBenefitCents: monthlyBenefit,
          clientRoi: revenue > 0 && monthlyBenefit > 0 ? Math.round(((monthlyBenefit * 12) / revenue) * 100) / 100 : null,
        }
      : null,
    regulatedTemplate: deployment.vertical ? REGULATED_PROHIBITED_TEMPLATE[deployment.vertical] ?? null : null,
  };
}
