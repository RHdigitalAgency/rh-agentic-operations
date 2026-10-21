import type { Queryable } from "@/lib/db/types";
import type { SessionUser } from "@/lib/auth/user";
import { can, requireCap } from "@/lib/auth/user";
import { assertFound, ForbiddenError, ValidationError } from "@/lib/errors";
import { bool, oneOf, optDate, optEmail, optOneOf, optStr, optUrl, reqStr } from "@/lib/validate";
import { checkTransition, isOpen, STAGES, type Stage, type TransitionFacts } from "@/domain/pipeline";
import { normalizeCurrency } from "@/domain/money";
import { endOfZonedDay } from "@/lib/time";
import type { KpiRow } from "@/domain/kpi";
import { assertCompanyVisible, companyVisible, containsPattern, logAudit, opportunityVisible, Sql, type Ctx } from "./context";
import { getDefaultLeadOwner } from "./settings";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface CompanyRow {
  id: string;
  name: string;
  website: string | null;
  city: string | null;
  country: string | null;
  vertical: string | null;
  employee_band: string | null;
  revenue_band: string | null;
  owner_user_id: string | null;
  owner_name: string | null;
  source: string | null;
  status: string;
  created_at: Date;
}

export interface ContactRow {
  id: string;
  company_id: string | null;
  name: string | null;
  role_title: string | null;
  email: string | null;
  phone: string | null;
  instagram_handle: string | null;
  linkedin_url: string | null;
  consent_status: string;
}

export interface OpportunityRow {
  id: string;
  company_id: string;
  company_name: string;
  vertical: string | null;
  primary_contact_id: string | null;
  contact_name: string | null;
  owner_user_id: string | null;
  owner_name: string | null;
  referrer_user_id: string | null;
  title: string | null;
  stage: Stage;
  source: string | null;
  campaign: string | null;
  content_id: string | null;
  keyword: string | null;
  referrer: string | null;
  utm: Record<string, string>;
  external_event_id: string | null;
  estimated_value_cents: number | null;
  currency: string;
  next_action: string | null;
  next_action_at: Date | null;
  loss_reason: string | null;
  loss_notes: string | null;
  nurture_at: Date | null;
  stage_changed_at: Date;
  created_at: Date;
}

const OPP_SELECT = `
  select o.id, o.company_id, c.name as company_name, c.vertical, o.primary_contact_id, ct.name as contact_name,
         o.owner_user_id, u.full_name as owner_name, o.referrer_user_id, o.title, o.stage, o.source, o.campaign,
         o.content_id, o.keyword, o.referrer, o.utm, o.external_event_id, o.estimated_value_cents, o.currency,
         o.next_action, o.next_action_at, o.loss_reason, o.loss_notes, o.nurture_at, o.stage_changed_at, o.created_at
  from opportunities o
  join companies c on c.id = o.company_id
  left join app_users u on u.id = o.owner_user_id
  left join contacts ct on ct.id = o.primary_contact_id`;

const isManager = (u: SessionUser) => u.role === "ADMIN_MANAGER";

// ---------------------------------------------------------------------------
// Users (for owner pickers)
// ---------------------------------------------------------------------------
export async function listActiveUsers(ctx: Ctx) {
  if (ctx.user.role === "EXTERNAL_REP") throw new ForbiddenError();
  return ctx.db.query<{ id: string; full_name: string | null; email: string; role: string }>(
    "select id, full_name, email, role from app_users where active order by full_name nulls last, email",
  );
}

/** Validates an owner assignment. Sales reps can only assign themselves. */
async function resolveOwner(db: Queryable, user: SessionUser, ownerId: unknown): Promise<string | null> {
  const id = optStr(ownerId, 64);
  if (user.role === "SALES_REP") {
    if (id && id !== user.id) throw new ForbiddenError("Sales reps can only assign opportunities to themselves");
    return user.id;
  }
  if (!id) return null;
  const [u] = await db.query<{ id: string; role: string }>("select id, role from app_users where id = $1 and active", [id]);
  if (!u) throw new ValidationError("Owner not found or inactive");
  if (!["ADMIN_MANAGER", "SALES_REP", "EXTERNAL_REP"].includes(u.role)) throw new ValidationError("Owner must be a manager, sales rep or partner");
  return u.id;
}

async function assertRef(db: Queryable, table: "ref_verticals" | "ref_loss_reasons", code: string | null, field: string) {
  if (!code) return;
  const [r] = await db.query(`select 1 from ${table} where code = $1`, [code]);
  if (!r) throw new ValidationError(`Unknown ${field}: ${code}`);
}

// ---------------------------------------------------------------------------
// Companies & contacts
// ---------------------------------------------------------------------------
export async function listCompanies(ctx: Ctx, filters: { q?: string; vertical?: string; limit?: number } = {}) {
  requireCap(ctx.user, "crm.read");
  const q = new Sql();
  const where = [`c.archived_at is null`, companyVisible(q, ctx.user, "c")];
  if (filters.q) where.push(`c.name ilike ${q.p(containsPattern(filters.q))}`);
  if (filters.vertical) where.push(`c.vertical = ${q.p(filters.vertical)}`);
  return ctx.db.query<CompanyRow & { open_opps: number; deployments: number }>(
    `select c.*, u.full_name as owner_name,
       (select count(*) from opportunities o where o.company_id = c.id and o.archived_at is null and o.stage not in ('WON_DEPLOYMENT','WON_RETAINER','LOST_NURTURE'))::int as open_opps,
       (select count(*) from deployments d where d.company_id = c.id)::int as deployments
     from companies c left join app_users u on u.id = c.owner_user_id
     where ${where.join(" and ")} order by c.name limit ${q.p(filters.limit ?? 500)}`,
    q.params,
  );
}

function companyFields(input: Record<string, unknown>) {
  return {
    name: reqStr(input.name, "Company name", 200),
    website: optUrl(input.website, "Website"),
    city: optStr(input.city, 120),
    country: optStr(input.country, 120),
    vertical: optStr(input.vertical, 40),
    employee_band: optStr(input.employee_band, 40),
    revenue_band: optStr(input.revenue_band, 40),
    source: optStr(input.source, 80)?.toLowerCase() ?? null,
  };
}

export async function createCompany(ctx: Ctx, input: Record<string, unknown>) {
  requireCap(ctx.user, "crm.write");
  const f = companyFields(input);
  await assertRef(ctx.db, "ref_verticals", f.vertical, "vertical");
  const owner = await resolveOwner(ctx.db, ctx.user, input.owner_user_id ?? ctx.user.id);
  return ctx.db.transaction(async (tx) => {
    const [row] = await tx.query<{ id: string }>(
      `insert into companies(name, website, city, country, vertical, employee_band, revenue_band, source, owner_user_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
      [f.name, f.website, f.city, f.country, f.vertical, f.employee_band, f.revenue_band, f.source, owner],
    );
    await logAudit(tx, ctx.user, "company", row.id, "create", null, { ...f, owner_user_id: owner });
    return row.id;
  });
}

export async function updateCompany(ctx: Ctx, id: string, input: Record<string, unknown>) {
  requireCap(ctx.user, "crm.write");
  await assertCompanyVisible(ctx.db, ctx.user, id);
  const f = companyFields(input);
  await assertRef(ctx.db, "ref_verticals", f.vertical, "vertical");
  await ctx.db.transaction(async (tx) => {
    const [before] = await tx.query("select * from companies where id = $1", [id]);
    await tx.query(
      `update companies set name=$2, website=$3, city=$4, country=$5, vertical=$6, employee_band=$7, revenue_band=$8, source=$9, updated_at=now() where id=$1`,
      [id, f.name, f.website, f.city, f.country, f.vertical, f.employee_band, f.revenue_band, f.source],
    );
    await logAudit(tx, ctx.user, "company", id, "update", before, f);
  });
}

export async function createContact(ctx: Ctx, companyId: string, input: Record<string, unknown>) {
  requireCap(ctx.user, "crm.write");
  await assertCompanyVisible(ctx.db, ctx.user, companyId);
  return insertContact(ctx.db, companyId, input);
}

async function insertContact(db: Queryable, companyId: string, input: Record<string, unknown>): Promise<string> {
  const name = optStr(input.name, 200);
  const email = optEmail(input.email);
  const phone = optStr(input.phone, 40);
  const ig = optStr(input.instagram_handle, 100)?.replace(/^@/, "") ?? null;
  if (!name && !email && !phone && !ig) throw new ValidationError("Contact needs at least a name, email, phone or Instagram handle");
  const [row] = await db.query<{ id: string }>(
    `insert into contacts(company_id, name, role_title, email, phone, instagram_handle, linkedin_url, consent_status)
     values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
    [
      companyId, name, optStr(input.role_title, 120), email, phone, ig, optUrl(input.linkedin_url, "LinkedIn URL"),
      optOneOf(input.consent_status, ["UNKNOWN", "OPTED_IN", "OPTED_OUT"] as const, "consent status") ?? "UNKNOWN",
    ],
  );
  return row.id;
}

/** Company 360 view: contacts, opportunities, audits, proposals, deployments, KPIs, activities. */
export async function getCompany360(ctx: Ctx, id: string) {
  requireCap(ctx.user, "crm.read");
  await assertCompanyVisible(ctx.db, ctx.user, id);
  const db = ctx.db;
  const [company] = await db.query<CompanyRow>(
    "select c.*, u.full_name as owner_name from companies c left join app_users u on u.id = c.owner_user_id where c.id = $1",
    [id],
  );
  const contacts = await db.query<ContactRow>("select * from contacts where company_id = $1 and archived_at is null order by created_at", [id]);
  const opportunities = await db.query<OpportunityRow>(`${OPP_SELECT} where o.company_id = $1 and o.archived_at is null order by o.created_at desc`, [id]);
  const audits = can(ctx.user, "audit.read")
    ? await db.query<{ id: string; status: string; price_cents: number; currency: string; paid_at: Date | null; process_count: number }>(
        `select a.id, a.status, a.price_cents, a.currency, a.paid_at,
           (select count(*) from processes p where p.audit_id = a.id)::int as process_count
         from audits a where a.company_id = $1 order by a.created_at desc`,
        [id],
      )
    : [];
  const proposals = can(ctx.user, "proposal.read")
    ? await db.query<{ id: string; title: string; proposal_type: string; status: string; amount_cents: number; currency: string }>(
        "select id, title, proposal_type, status, amount_cents, currency from proposals where company_id = $1 order by created_at desc",
        [id],
      )
    : [];
  const deployments = can(ctx.user, "delivery.read")
    ? await db.query<{ id: string; name: string; status: string; owner_name: string | null }>(
        "select d.id, d.name, d.status, u.full_name as owner_name from deployments d left join app_users u on u.id = d.owner_user_id where d.company_id = $1 order by d.created_at desc",
        [id],
      )
    : [];
  const retainers = can(ctx.user, "proposal.read")
    ? await db.query<{ id: string; mrr_cents: number; currency: string; status: string; start_date: string }>(
        "select id, mrr_cents, currency, status, start_date from retainers where company_id = $1 order by start_date desc",
        [id],
      )
    : [];
  const kpis = can(ctx.user, "delivery.read")
    ? await db.query<KpiRow & { deployment_id: string }>(
        `select k.* from kpi_measurements k join deployments d on d.id = k.deployment_id where d.company_id = $1
         order by k.metric_key, k.measurement_type, k.window_end`,
        [id],
      )
    : [];
  const activities = await listActivities(ctx, { companyId: id });
  return { company, contacts, opportunities, audits, proposals, deployments, retainers, kpis, activities };
}

// ---------------------------------------------------------------------------
// Opportunities
// ---------------------------------------------------------------------------
export interface OpportunityFilters {
  view?: "open" | "won" | "lost" | "all";
  stage?: string;
  ownerId?: string;
  source?: string;
  vertical?: string;
  q?: string;
  from?: string;
  to?: string;
  /** Row cap for screens; exports pass a larger one. */
  limit?: number;
}

export async function listOpportunities(ctx: Ctx, f: OpportunityFilters = {}) {
  requireCap(ctx.user, "crm.read");
  const q = new Sql();
  const where = ["o.archived_at is null", opportunityVisible(q, ctx.user, "o", "c")];
  if (f.view === "open") where.push(`o.stage not in ('WON_DEPLOYMENT','WON_RETAINER','LOST_NURTURE')`);
  if (f.view === "won") where.push(`o.stage in ('WON_DEPLOYMENT','WON_RETAINER')`);
  if (f.view === "lost") where.push(`o.stage = 'LOST_NURTURE'`);
  if (f.stage) where.push(`o.stage = ${q.p(f.stage)}`);
  if (f.ownerId) where.push(`o.owner_user_id = ${q.p(f.ownerId)}`);
  if (f.source) where.push(`o.source = ${q.p(f.source)}`);
  if (f.vertical) where.push(`c.vertical = ${q.p(f.vertical)}`);
  if (f.from) where.push(`o.created_at >= ${q.p(f.from)}::date`);
  if (f.to) where.push(`o.created_at < (${q.p(f.to)}::date + 1)`);
  if (f.q) {
    const like = q.p(containsPattern(f.q));
    where.push(`(c.name ilike ${like} or o.title ilike ${like} or o.keyword ilike ${like} or o.campaign ilike ${like})`);
  }
  return ctx.db.query<OpportunityRow>(`${OPP_SELECT} where ${where.join(" and ")} order by o.next_action_at nulls last, o.created_at desc limit ${q.p(f.limit ?? 1000)}`, q.params);
}

export async function getOpportunity(ctx: Ctx, id: string) {
  requireCap(ctx.user, "crm.read");
  const q = new Sql();
  const [opp] = await ctx.db.query<OpportunityRow>(
    `${OPP_SELECT} where o.id = ${q.p(id)} and o.archived_at is null and ${opportunityVisible(q, ctx.user, "o", "c")}`,
    q.params,
  );
  return assertFound(opp, "Opportunity");
}

export async function getOpportunityDetail(ctx: Ctx, id: string) {
  const opp = await getOpportunity(ctx, id);
  const db = ctx.db;
  const fitCalls = await db.query<{ id: string; scheduled_at: Date; completed_at: Date | null; outcome: string | null; pain_summary: string | null; audit_recommended: boolean | null }>(
    "select * from fit_calls where opportunity_id = $1 order by scheduled_at desc",
    [id],
  );
  const history = await db.query<{ from_stage: string | null; to_stage: string; changed_at: Date; changed_by_name: string | null }>(
    `select h.from_stage, h.to_stage, h.changed_at, u.full_name as changed_by_name
     from opportunity_stage_history h left join app_users u on u.id = h.changed_by where h.opportunity_id = $1 order by h.changed_at, h.id`,
    [id],
  );
  const audits = can(ctx.user, "audit.read")
    ? await db.query<{ id: string; status: string; price_cents: number; currency: string; paid_at: Date | null }>(
        "select id, status, price_cents, currency, paid_at from audits where opportunity_id = $1 order by created_at desc",
        [id],
      )
    : [];
  const proposals = can(ctx.user, "proposal.read")
    ? await db.query<{ id: string; title: string; proposal_type: string; status: string; amount_cents: number; currency: string }>(
        "select id, title, proposal_type, status, amount_cents, currency from proposals where opportunity_id = $1 order by created_at desc",
        [id],
      )
    : [];
  const contacts = await db.query<ContactRow>("select * from contacts where company_id = $1 and archived_at is null order by created_at", [opp.company_id]);
  const activities = await listActivities(ctx, { opportunityId: id });
  return { opp, fitCalls, history, audits, proposals, contacts, activities };
}

export interface NewOpportunityFields {
  companyId: string;
  contactId: string | null;
  ownerId: string | null;
  referrerUserId?: string | null;
  title: string | null;
  source: string | null;
  campaign: string | null;
  contentId: string | null;
  keyword: string | null;
  referrer: string | null;
  utm: Record<string, string>;
  externalEventId: string | null;
  estimatedValueCents: number | null;
  currency: string;
  nextAction: string | null;
  nextActionAt: Date | null;
}

/** Shared by manual lead creation, partner referrals and external ingestion. */
export async function insertOpportunity(tx: Queryable, actor: SessionUser | null, f: NewOpportunityFields, actorLabel?: string): Promise<string> {
  const [row] = await tx.query<{ id: string }>(
    `insert into opportunities(company_id, primary_contact_id, owner_user_id, referrer_user_id, title, stage, source, campaign, content_id, keyword,
       referrer, utm, external_event_id, estimated_value_cents, currency, next_action, next_action_at)
     values ($1,$2,$3,$4,$5,'NEW_LEAD',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) returning id`,
    [
      f.companyId, f.contactId, f.ownerId, f.referrerUserId ?? null, f.title, f.source, f.campaign, f.contentId, f.keyword,
      f.referrer, JSON.stringify(f.utm), f.externalEventId, f.estimatedValueCents, f.currency, f.nextAction, f.nextActionAt,
    ],
  );
  await tx.query("insert into opportunity_stage_history(opportunity_id, from_stage, to_stage, changed_by) values ($1, null, 'NEW_LEAD', $2)", [row.id, actor?.id ?? null]);
  await logAudit(tx, actor, "opportunity", row.id, "create", null, f, actorLabel);
  return row.id;
}

function parseUtm(input: unknown): Record<string, string> {
  if (!input) return {};
  let obj: unknown = input;
  if (typeof input === "string") {
    try {
      obj = JSON.parse(input);
    } catch {
      throw new ValidationError("UTM must be a JSON object");
    }
  }
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) throw new ValidationError("UTM must be an object");
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>).slice(0, 20)) {
    if (/^[a-z0-9_]{1,40}$/i.test(k) && v !== null && v !== undefined) out[k] = String(v).slice(0, 300);
  }
  return out;
}

/** Manual lead creation: existing or new company + optional contact + attributed opportunity. */
export async function createLead(ctx: Ctx, input: Record<string, unknown>) {
  requireCap(ctx.user, "crm.write");
  const owner = await resolveOwner(ctx.db, ctx.user, input.owner_user_id ?? ctx.user.id);
  let existingCompanyId = optStr(input.company_id, 64);
  if (existingCompanyId) await assertCompanyVisible(ctx.db, ctx.user, existingCompanyId);
  // One "Company" field: an exact (case-insensitive) match to a visible account links to it instead of creating a duplicate.
  // A lead without a company (an individual) uses the contact name or Instagram handle as the account name.
  const typedName = optStr(input.company_name, 200)
    ?? optStr(input.contact_name, 200)
    ?? (optStr(input.instagram_handle, 100) ? `@${String(input.instagram_handle).trim().replace(/^@/, "")}` : null);
  if (!existingCompanyId && !typedName) throw new ValidationError("Enter a company or a contact name");
  if (!existingCompanyId && optStr(input.company_name, 200)) {
    const q = new Sql();
    const [match] = await ctx.db.query<{ id: string }>(
      `select c.id from companies c where lower(c.name) = lower(${q.p(typedName)}) and c.archived_at is null and ${companyVisible(q, ctx.user, "c")} limit 1`,
      q.params,
    );
    existingCompanyId = match?.id ?? null;
  }
  const companyInput = existingCompanyId ? null : companyFields({ ...input, name: typedName });
  if (companyInput) await assertRef(ctx.db, "ref_verticals", companyInput.vertical, "vertical");
  const hasContact = ["contact_name", "email", "phone", "instagram_handle"].some((k) => optStr(input[k]));
  const estimated = input.estimated_value_cents === undefined || input.estimated_value_cents === null || input.estimated_value_cents === ""
    ? null
    : Number(input.estimated_value_cents);
  if (estimated !== null && (!Number.isSafeInteger(estimated) || estimated < 0)) throw new ValidationError("Estimated value must be a non-negative amount");

  return ctx.db.transaction(async (tx) => {
    let companyId = existingCompanyId;
    if (!companyId && companyInput) {
      const [c] = await tx.query<{ id: string }>(
        `insert into companies(name, website, city, country, vertical, employee_band, revenue_band, source, owner_user_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
        [companyInput.name, companyInput.website, companyInput.city, companyInput.country, companyInput.vertical,
          companyInput.employee_band, companyInput.revenue_band, companyInput.source, owner],
      );
      companyId = c.id;
      await logAudit(tx, ctx.user, "company", c.id, "create", null, companyInput);
    }
    const contactId = hasContact
      ? await insertContact(tx, companyId!, {
          name: input.contact_name, role_title: input.role_title, email: input.email, phone: input.phone, instagram_handle: input.instagram_handle,
        })
      : null;
    return insertOpportunity(tx, ctx.user, {
      companyId: companyId!,
      contactId,
      ownerId: owner,
      title: optStr(input.title, 200),
      source: optStr(input.source, 80)?.toLowerCase() ?? null,
      campaign: optStr(input.campaign, 120),
      contentId: optStr(input.content_id, 200),
      keyword: optStr(input.keyword, 80),
      referrer: optStr(input.referrer, 200),
      utm: parseUtm(input.utm),
      externalEventId: null,
      estimatedValueCents: estimated,
      currency: normalizeCurrency(optStr(input.currency, 3)),
      nextAction: optStr(input.next_action, 300),
      nextActionAt: optDate(input.next_action_at, "Next action date"),
    });
  });
}

export async function updateOpportunity(ctx: Ctx, id: string, input: Record<string, unknown>) {
  requireCap(ctx.user, "crm.write");
  const before = await getOpportunity(ctx, id);
  const ownerChanged = input.owner_user_id !== undefined && (optStr(input.owner_user_id, 64) ?? null) !== before.owner_user_id;
  const owner = ownerChanged ? await resolveOwner(ctx.db, ctx.user, input.owner_user_id) : before.owner_user_id;
  const estimated = input.estimated_value_cents === "" || input.estimated_value_cents === null || input.estimated_value_cents === undefined
    ? null : Number(input.estimated_value_cents);
  if (estimated !== null && (!Number.isSafeInteger(estimated) || estimated < 0)) throw new ValidationError("Estimated value must be a non-negative amount");
  const contactId = optStr(input.primary_contact_id, 64);
  if (contactId) {
    const [ct] = await ctx.db.query("select 1 from contacts where id = $1 and company_id = $2", [contactId, before.company_id]);
    if (!ct) throw new ValidationError("Primary contact must belong to the same company");
  }
  const after = {
    owner_user_id: owner,
    title: optStr(input.title, 200),
    estimated_value_cents: estimated,
    currency: normalizeCurrency(optStr(input.currency, 3) ?? before.currency),
    next_action: optStr(input.next_action, 300),
    next_action_at: optDate(input.next_action_at, "Next action date"),
    primary_contact_id: contactId,
  };
  if (isOpen(before.stage) && before.stage !== "NEW_LEAD" && !after.next_action) {
    throw new ValidationError("Open opportunities past New Lead must keep a next action");
  }
  await ctx.db.transaction(async (tx) => {
    await tx.query(
      `update opportunities set owner_user_id=$2, title=$3, estimated_value_cents=$4, currency=$5, next_action=$6, next_action_at=$7,
         primary_contact_id=$8, updated_at=now() where id=$1`,
      [id, after.owner_user_id, after.title, after.estimated_value_cents, after.currency, after.next_action, after.next_action_at, after.primary_contact_id],
    );
    await logAudit(tx, ctx.user, "opportunity", id, "update", pick(before, Object.keys(after)), after);
  });
}

function pick(obj: object, keys: string[]) {
  const src = obj as Record<string, unknown>;
  return Object.fromEntries(keys.map((k) => [k, src[k]]));
}

export async function archiveOpportunity(ctx: Ctx, id: string) {
  if (!isManager(ctx.user)) throw new ForbiddenError();
  await getOpportunity(ctx, id);
  await ctx.db.transaction(async (tx) => {
    await tx.query("update opportunities set archived_at = now(), updated_at = now() where id = $1", [id]);
    await logAudit(tx, ctx.user, "opportunity", id, "archive", null, { archived: true });
  });
}

// ---------------------------------------------------------------------------
// Stage transitions
// ---------------------------------------------------------------------------
async function gatherFacts(db: Queryable, id: string): Promise<TransitionFacts & { stage: Stage }> {
  const [r] = await db.query<Record<string, unknown>>(
    `select o.stage, o.owner_user_id is not null as has_owner, o.next_action is not null as has_next_action, o.loss_reason, o.nurture_at,
       exists(select 1 from fit_calls f where f.opportunity_id = o.id) as has_scheduled_fit_call,
       exists(select 1 from fit_calls f where f.opportunity_id = o.id and f.completed_at is not null and f.outcome = 'QUALIFIED' and f.audit_recommended) as has_qualified_fit_call,
       exists(select 1 from audits a where a.opportunity_id = o.id and a.status <> 'CANCELLED') as has_audit_offer,
       exists(select 1 from audits a where a.opportunity_id = o.id and a.status <> 'CANCELLED' and a.paid_at is not null) as has_paid_audit,
       exists(select 1 from audits a where a.opportunity_id = o.id and a.status in ('IN_PROGRESS','PRESENTED')) as audit_in_progress_or_later,
       exists(select 1 from audits a where a.opportunity_id = o.id and a.status = 'PRESENTED') as audit_presented,
       exists(select 1 from proposals p where p.opportunity_id = o.id and p.sent_at is not null) as has_sent_proposal,
       exists(select 1 from proposals p where p.opportunity_id = o.id and p.status = 'ACCEPTED' and p.proposal_type <> 'RETAINER') as has_accepted_impl,
       exists(select 1 from proposals p where p.opportunity_id = o.id and p.status = 'ACCEPTED' and p.proposal_type = 'RETAINER') as has_accepted_retainer
     from opportunities o where o.id = $1 for update of o`,
    [id],
  );
  return {
    stage: r.stage as Stage,
    hasOwner: Boolean(r.has_owner),
    hasNextAction: Boolean(r.has_next_action),
    hasScheduledFitCall: Boolean(r.has_scheduled_fit_call),
    hasQualifiedFitCall: Boolean(r.has_qualified_fit_call),
    hasAuditOffer: Boolean(r.has_audit_offer),
    hasPaidAudit: Boolean(r.has_paid_audit),
    auditInProgressOrLater: Boolean(r.audit_in_progress_or_later),
    auditPresented: Boolean(r.audit_presented),
    hasSentProposal: Boolean(r.has_sent_proposal),
    hasAcceptedImplementationProposal: Boolean(r.has_accepted_impl),
    hasAcceptedRetainer: Boolean(r.has_accepted_retainer),
    lossReason: (r.loss_reason as string) ?? null,
    nurtureAt: (r.nurture_at as Date) ?? null,
  };
}

async function applyTransition(tx: Queryable, actor: SessionUser | null, id: string, from: Stage, to: Stage, reason = "stage_change") {
  await tx.query("update opportunities set stage = $2, stage_changed_at = now(), updated_at = now() where id = $1", [id, to]);
  await tx.query("insert into opportunity_stage_history(opportunity_id, from_stage, to_stage, changed_by) values ($1,$2,$3,$4)", [id, from, to, actor?.id ?? null]);
  await logAudit(tx, actor, "opportunity", id, reason, { stage: from }, { stage: to });
}

export async function transitionStage(
  ctx: Ctx,
  id: string,
  toInput: unknown,
  opts: { loss_reason?: unknown; loss_notes?: unknown; nurture_at?: unknown } = {},
) {
  requireCap(ctx.user, "crm.write");
  const to = oneOf(toInput, STAGES, "stage");
  await getOpportunity(ctx, id); // visibility
  await ctx.db.transaction(async (tx) => {
    if (to === "LOST_NURTURE") {
      const lossReason = optStr(opts.loss_reason, 40);
      await assertRef(tx, "ref_loss_reasons", lossReason, "loss reason");
      const nurtureAt = optDate(opts.nurture_at, "Nurture date");
      await tx.query("update opportunities set loss_reason = $2, loss_notes = $3, nurture_at = $4 where id = $1", [
        id, lossReason, optStr(opts.loss_notes, 2000), nurtureAt,
      ]);
    }
    const facts = await gatherFacts(tx, id);
    const result = checkTransition(facts.stage, to, facts, { isManager: isManager(ctx.user) });
    if (!result.ok) throw new ValidationError(result.reason);
    if (facts.stage === "LOST_NURTURE") {
      await tx.query("update opportunities set loss_reason = null, loss_notes = null, nurture_at = null where id = $1", [id]);
    }
    await applyTransition(tx, ctx.user, id, facts.stage, to);
  });
}

/**
 * System-driven advance (audit paid, proposal sent/accepted, fit call booked...). Only moves the opportunity
 * when it sits exactly at `from`, so each intermediate stage is recorded and funnel metrics stay comparable.
 */
export async function autoAdvance(tx: Queryable, actor: SessionUser | null, opportunityId: string | null, from: Stage, to: Stage) {
  if (!opportunityId) return false;
  const facts = await gatherFacts(tx, opportunityId);
  if (facts.stage !== from) return false;
  if (!checkTransition(from, to, facts, { isManager: false }).ok) return false;
  await applyTransition(tx, actor, opportunityId, from, to, "stage_auto_advance");
  return true;
}

// ---------------------------------------------------------------------------
// Fit calls
// ---------------------------------------------------------------------------
export async function scheduleFitCall(ctx: Ctx, opportunityId: string, input: Record<string, unknown>) {
  requireCap(ctx.user, "crm.write");
  await getOpportunity(ctx, opportunityId);
  const scheduledAt = optDate(input.scheduled_at, "Fit call date");
  if (!scheduledAt) throw new ValidationError("Fit call date is required");
  return ctx.db.transaction(async (tx) => {
    const [row] = await tx.query<{ id: string }>(
      "insert into fit_calls(opportunity_id, scheduled_at, owner_user_id) values ($1,$2,$3) returning id",
      [opportunityId, scheduledAt, ctx.user.id],
    );
    await tx.query("update opportunities set next_action = 'Run 15-minute fit call', next_action_at = $2, updated_at = now() where id = $1", [opportunityId, scheduledAt]);
    await logAudit(tx, ctx.user, "fit_call", row.id, "schedule", null, { opportunityId, scheduledAt });
    await autoAdvance(tx, ctx.user, opportunityId, "CONTACTED", "FIT_CALL_BOOKED");
    return row.id;
  });
}

export async function completeFitCall(ctx: Ctx, fitCallId: string, input: Record<string, unknown>) {
  requireCap(ctx.user, "crm.write");
  const [fc] = await ctx.db.query<{ opportunity_id: string }>("select opportunity_id from fit_calls where id = $1", [fitCallId]);
  assertFound(fc, "Fit call");
  await getOpportunity(ctx, fc.opportunity_id);
  const outcome = oneOf(input.outcome, ["QUALIFIED", "NOT_QUALIFIED", "NO_SHOW"] as const, "outcome");
  const auditRecommended = outcome === "QUALIFIED" && bool(input.audit_recommended);
  await ctx.db.transaction(async (tx) => {
    const after = { completed_at: optDate(input.completed_at, "Completed at") ?? new Date(), outcome, pain_summary: optStr(input.pain_summary, 4000), audit_recommended: auditRecommended };
    await tx.query("update fit_calls set completed_at=$2, outcome=$3, pain_summary=$4, audit_recommended=$5 where id=$1", [
      fitCallId, after.completed_at, after.outcome, after.pain_summary, after.audit_recommended,
    ]);
    await logAudit(tx, ctx.user, "fit_call", fitCallId, "complete", null, after);
    if (outcome === "QUALIFIED" && auditRecommended) {
      await tx.query("update opportunities set next_action = 'Offer paid audit', next_action_at = now() + interval '2 days', updated_at = now() where id = $1", [fc.opportunity_id]);
      await autoAdvance(tx, ctx.user, fc.opportunity_id, "FIT_CALL_BOOKED", "FIT_QUALIFIED");
    }
  });
}

// ---------------------------------------------------------------------------
// Activities & follow-up queue
// ---------------------------------------------------------------------------
export const ACTIVITY_TYPES = ["CALL", "EMAIL", "DM", "MEETING", "TASK", "NOTE"] as const;

export async function listActivities(ctx: Ctx, f: { companyId?: string; opportunityId?: string }) {
  requireCap(ctx.user, "crm.read");
  const q = new Sql();
  const where = [companyVisible(q, ctx.user, "c")];
  if (f.companyId) where.push(`a.company_id = ${q.p(f.companyId)}`);
  if (f.opportunityId) where.push(`a.opportunity_id = ${q.p(f.opportunityId)}`);
  return ctx.db.query<{ id: string; activity_type: string; notes: string | null; occurred_at: Date; owner_name: string | null; opportunity_id: string | null }>(
    `select a.id, a.activity_type, a.notes, a.occurred_at, u.full_name as owner_name, a.opportunity_id
     from activities a join companies c on c.id = a.company_id left join app_users u on u.id = a.owner_user_id
     where ${where.join(" and ")} order by a.occurred_at desc limit 200`,
    q.params,
  );
}

export async function addActivity(ctx: Ctx, input: Record<string, unknown>) {
  requireCap(ctx.user, "activity.write");
  let companyId = optStr(input.company_id, 64);
  const opportunityId = optStr(input.opportunity_id, 64);
  if (opportunityId) companyId = (await getOpportunity(ctx, opportunityId)).company_id;
  if (!companyId) throw new ValidationError("Activity must belong to a company or opportunity");
  await assertCompanyVisible(ctx.db, ctx.user, companyId);
  const type = oneOf(input.activity_type, ACTIVITY_TYPES, "activity type");
  const [row] = await ctx.db.query<{ id: string }>(
    "insert into activities(opportunity_id, company_id, owner_user_id, activity_type, notes, occurred_at) values ($1,$2,$3,$4,$5,$6) returning id",
    [opportunityId, companyId, ctx.user.id, type, optStr(input.notes, 4000), optDate(input.occurred_at, "Date") ?? new Date()],
  );
  return row.id;
}

export async function followUpQueue(ctx: Ctx, f: { ownerId?: string } = {}) {
  const open = await listOpportunities(ctx, { view: "open", ownerId: f.ownerId });
  const now = new Date();
  const endOfToday = endOfZonedDay(now);
  const in7 = new Date(endOfToday.getTime() + 7 * 86400000);
  const overdue: OpportunityRow[] = [];
  const today: OpportunityRow[] = [];
  const next7: OpportunityRow[] = [];
  const missing: OpportunityRow[] = [];
  for (const o of open) {
    if (!o.next_action_at) missing.push(o);
    else if (o.next_action_at < now) overdue.push(o);
    else if (o.next_action_at <= endOfToday) today.push(o);
    else if (o.next_action_at <= in7) next7.push(o);
  }
  return { overdue, today, next7, missing };
}

export const SNOOZE_DAYS = [1, 7] as const;

/** Pushes the next-action deadline out by N days, counted from now when it is already overdue. */
export async function snoozeFollowUp(ctx: Ctx, id: string, days: number) {
  requireCap(ctx.user, "crm.write");
  if (!SNOOZE_DAYS.includes(days as (typeof SNOOZE_DAYS)[number])) throw new ValidationError("Snooze must be 1 or 7 days");
  const opp = await getOpportunity(ctx, id);
  if (!isOpen(opp.stage)) throw new ValidationError("Only open opportunities have follow-ups");
  if (!opp.next_action) throw new ValidationError("Set a next action before snoozing");
  const base = opp.next_action_at && opp.next_action_at > new Date() ? opp.next_action_at : new Date();
  const until = new Date(base.getTime() + days * 86400000);
  await ctx.db.transaction(async (tx) => {
    await tx.query("update opportunities set next_action_at = $2, updated_at = now() where id = $1", [id, until]);
    await logAudit(tx, ctx.user, "opportunity", id, "snooze", { next_action_at: opp.next_action_at }, { next_action_at: until });
  });
  return until;
}

/**
 * Marks the current follow-up as done: records what happened as an activity and sets the next step in one go,
 * so an open opportunity never loses its next action.
 */
export async function completeFollowUp(ctx: Ctx, id: string, input: Record<string, unknown>) {
  requireCap(ctx.user, "crm.write");
  requireCap(ctx.user, "activity.write");
  const opp = await getOpportunity(ctx, id);
  if (!isOpen(opp.stage)) throw new ValidationError("Only open opportunities have follow-ups");
  const type = oneOf(input.activity_type || "TASK", ACTIVITY_TYPES, "activity type");
  const notes = optStr(input.notes, 4000);
  const nextAction = reqStr(input.next_action, "Next action", 300);
  const nextAt = optDate(input.next_action_at, "Next action date");
  if (!nextAt) throw new ValidationError("Next action date is required");
  const done = opp.next_action ? `Done: ${opp.next_action}` : "Follow-up done";
  await ctx.db.transaction(async (tx) => {
    await tx.query(
      "insert into activities(opportunity_id, company_id, owner_user_id, activity_type, notes, occurred_at) values ($1,$2,$3,$4,$5,now())",
      [id, opp.company_id, ctx.user.id, type, notes ? `${done}\n${notes}` : done],
    );
    await tx.query("update opportunities set next_action = $2, next_action_at = $3, updated_at = now() where id = $1", [id, nextAction, nextAt]);
    await logAudit(tx, ctx.user, "opportunity", id, "follow_up_done",
      { next_action: opp.next_action, next_action_at: opp.next_action_at }, { next_action: nextAction, next_action_at: nextAt });
  });
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------
export async function search(ctx: Ctx, term: string) {
  requireCap(ctx.user, "crm.read");
  const t = term.trim();
  if (t.length < 2) return { companies: [], contacts: [], opportunities: [] };
  const q1 = new Sql();
  const like1 = q1.p(containsPattern(t));
  const companies = await ctx.db.query<{ id: string; name: string; vertical: string | null }>(
    `select c.id, c.name, c.vertical from companies c where c.archived_at is null and (c.name ilike ${like1} or c.website ilike ${like1}) and ${companyVisible(q1, ctx.user, "c")} order by c.name limit 20`,
    q1.params,
  );
  const q2 = new Sql();
  const like2 = q2.p(containsPattern(t));
  const contacts = await ctx.db.query<{ id: string; name: string | null; email: string | null; company_id: string; company_name: string }>(
    `select ct.id, ct.name, ct.email, c.id as company_id, c.name as company_name from contacts ct join companies c on c.id = ct.company_id
     where ct.archived_at is null and (ct.name ilike ${like2} or ct.email ilike ${like2} or ct.instagram_handle ilike ${like2} or ct.phone ilike ${like2})
       and ${companyVisible(q2, ctx.user, "c")} limit 20`,
    q2.params,
  );
  const opportunities = (await listOpportunities(ctx, { q: t })).slice(0, 20);
  return { companies, contacts, opportunities };
}

// ---------------------------------------------------------------------------
// Partner / external rep referrals (restricted surface)
// ---------------------------------------------------------------------------
export async function submitReferral(ctx: Ctx, input: Record<string, unknown>) {
  requireCap(ctx.user, "referral.submit");
  const companyName = reqStr(input.company_name, "Company name", 200);
  const vertical = optStr(input.vertical, 40);
  await assertRef(ctx.db, "ref_verticals", vertical, "vertical");
  const owner = await getDefaultLeadOwner(ctx.db);
  return ctx.db.transaction(async (tx) => {
    const [c] = await tx.query<{ id: string }>(
      "insert into companies(name, vertical, source, owner_user_id) values ($1,$2,'partner',$3) returning id",
      [companyName, vertical, owner],
    );
    const contactId = ["contact_name", "email", "phone"].some((k) => optStr(input[k]))
      ? await insertContact(tx, c.id, { name: input.contact_name, email: input.email, phone: input.phone })
      : null;
    const oppId = await insertOpportunity(tx, ctx.user, {
      companyId: c.id, contactId, ownerId: owner, referrerUserId: ctx.user.id, title: `Referral: ${companyName}`,
      source: "partner", campaign: null, contentId: null, keyword: null, referrer: ctx.user.fullName ?? ctx.user.email, utm: {},
      externalEventId: null, estimatedValueCents: null, currency: "USD",
      nextAction: "Contact partner referral", nextActionAt: new Date(Date.now() + 86400000),
    });
    const notes = optStr(input.notes, 2000);
    if (notes) {
      await tx.query("insert into activities(opportunity_id, company_id, owner_user_id, activity_type, notes) values ($1,$2,$3,'NOTE',$4)", [
        oppId, c.id, ctx.user.id, `Partner referral note: ${notes}`,
      ]);
    }
    return oppId;
  });
}

/** Partners only see permitted status fields of their attributed opportunities. */
export async function listMyReferrals(ctx: Ctx) {
  requireCap(ctx.user, "referral.submit");
  return ctx.db.query<{ id: string; company_name: string; stage: Stage; created_at: Date; stage_changed_at: Date }>(
    `select o.id, c.name as company_name, o.stage, o.created_at, o.stage_changed_at
     from opportunities o join companies c on c.id = o.company_id
     where o.archived_at is null and (o.referrer_user_id = $1 or o.owner_user_id = $1) order by o.created_at desc`,
    [ctx.user.id],
  );
}

export async function listReference(db: Queryable) {
  const [verticals, sources, lossReasons, classifications] = await Promise.all([
    db.query<{ code: string; name: string; regulated: boolean }>("select code, name, regulated from ref_verticals where active order by priority nulls last, name"),
    db.query<{ code: string; name: string }>("select code, name from ref_sources where active order by name"),
    db.query<{ code: string; name: string }>("select code, name from ref_loss_reasons where active order by name"),
    db.query<{ code: string; name: string; description: string }>("select code, name, description from ref_process_classifications order by code"),
  ]);
  return { verticals, sources, lossReasons, classifications };
}
