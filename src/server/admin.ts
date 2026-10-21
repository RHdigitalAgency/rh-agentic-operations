import { requireCap } from "@/lib/auth/user";
import { hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from "@/lib/auth/password";
import { ROLES } from "@/lib/auth/roles";
import { ConflictError, ValidationError } from "@/lib/errors";
import { bool, oneOf, optEmail, optStr, reqNum, reqStr } from "@/lib/validate";
import { SCORE_DIMENSIONS, validateWeights } from "@/domain/scoring";
import { logAudit, type Ctx } from "./context";

export async function listUsers(ctx: Ctx) {
  requireCap(ctx.user, "settings.manage");
  return ctx.db.query<{ id: string; email: string; full_name: string | null; role: string; territory: string | null; active: boolean; created_at: Date }>(
    "select id, email, full_name, role, territory, active, created_at from app_users order by active desc, full_name",
  );
}

export async function createUser(ctx: Ctx, input: Record<string, unknown>) {
  requireCap(ctx.user, "settings.manage");
  const email = optEmail(input.email);
  if (!email) throw new ValidationError("Email is required");
  const password = String(input.password ?? "");
  if (password.length < MIN_PASSWORD_LENGTH) throw new ValidationError(`Temporary password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  const role = oneOf(input.role, ROLES, "role");
  const [exists] = await ctx.db.query("select 1 from app_users where lower(email) = $1", [email]);
  if (exists) throw new ConflictError("A user with that email already exists");
  return ctx.db.transaction(async (tx) => {
    const [row] = await tx.query<{ id: string }>(
      "insert into app_users(email, full_name, role, territory, password_hash) values ($1,$2,$3,$4,$5) returning id",
      [email, reqStr(input.full_name, "Full name", 200), role, optStr(input.territory, 120), hashPassword(password)],
    );
    await logAudit(tx, ctx.user, "app_user", row.id, "create", null, { email, role });
    return row.id;
  });
}

export async function updateUser(ctx: Ctx, id: string, input: Record<string, unknown>) {
  requireCap(ctx.user, "settings.manage");
  const role = oneOf(input.role, ROLES, "role");
  const active = bool(input.active);
  if (id === ctx.user.id && (!active || role !== "ADMIN_MANAGER")) throw new ValidationError("You cannot demote or deactivate yourself");
  await ctx.db.transaction(async (tx) => {
    const [before] = await tx.query<{ role: string; active: boolean }>("select role, active from app_users where id = $1", [id]);
    if (!before) throw new ValidationError("User not found");
    await tx.query("update app_users set role = $2, active = $3, territory = $4 where id = $1", [id, role, active, optStr(input.territory, 120)]);
    if (!active) await tx.query("delete from user_sessions where user_id = $1", [id]);
    await logAudit(tx, ctx.user, "app_user", id, "update", before, { role, active });
  });
}

export async function resetPassword(ctx: Ctx, id: string, password: string) {
  requireCap(ctx.user, "settings.manage");
  if (password.length < MIN_PASSWORD_LENGTH) throw new ValidationError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  await ctx.db.transaction(async (tx) => {
    await tx.query("update app_users set password_hash = $2 where id = $1", [id, hashPassword(password)]);
    await tx.query("delete from user_sessions where user_id = $1", [id]);
    // An admin reset also lifts any sign-in lockout for that user.
    await tx.query("insert into login_attempts(email, succeeded) select lower(email), true from app_users where id = $1", [id]);
    await logAudit(tx, ctx.user, "app_user", id, "password_reset", null, null);
  });
}

/** Any signed-in user changes their own password; other sessions of that user are signed out. */
export async function changeOwnPassword(ctx: Ctx, input: Record<string, unknown>, keepSessionTokenHash?: string) {
  const current = String(input.current_password ?? "");
  const next = String(input.new_password ?? "");
  if (next !== String(input.confirm_password ?? "")) throw new ValidationError("The new passwords do not match");
  if (next.length < MIN_PASSWORD_LENGTH) throw new ValidationError(`New password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  if (next === current) throw new ValidationError("Choose a password different from the current one");
  const [row] = await ctx.db.query<{ password_hash: string | null }>("select password_hash from app_users where id = $1", [ctx.user.id]);
  if (!verifyPassword(current, row?.password_hash)) throw new ValidationError("Current password is incorrect");
  await ctx.db.transaction(async (tx) => {
    await tx.query("update app_users set password_hash = $2 where id = $1", [ctx.user.id, hashPassword(next)]);
    await tx.query("delete from user_sessions where user_id = $1 and token_hash is distinct from $2", [ctx.user.id, keepSessionTokenHash ?? null]);
    await logAudit(tx, ctx.user, "app_user", ctx.user.id, "password_changed_by_self", null, null);
  });
}

export async function updateOwnProfile(ctx: Ctx, input: Record<string, unknown>) {
  const name = reqStr(input.full_name, "Full name", 200);
  await ctx.db.transaction(async (tx) => {
    await tx.query("update app_users set full_name = $2 where id = $1", [ctx.user.id, name]);
    await logAudit(tx, ctx.user, "app_user", ctx.user.id, "profile_update", { full_name: ctx.user.fullName }, { full_name: name });
  });
}

export async function listWeightSets(ctx: Ctx) {
  requireCap(ctx.user, "audit.read");
  return ctx.db.query<{ version: string; weights: Record<string, number>; active: boolean; notes: string | null; created_at: Date }>(
    "select version, weights, active, notes, created_at from scoring_weight_sets order by created_at desc",
  );
}

/** New weight versions are appended and activated; stored scores keep the weights they were computed with. */
export async function createWeightSet(ctx: Ctx, input: Record<string, unknown>) {
  requireCap(ctx.user, "settings.manage");
  const version = reqStr(input.version, "Version", 40);
  if (!/^[A-Za-z0-9._-]+$/.test(version)) throw new ValidationError("Version may contain letters, digits, dot, dash, underscore");
  const weights = validateWeights(Object.fromEntries(SCORE_DIMENSIONS.map((d) => [d.key, input[d.key]])));
  await ctx.db.transaction(async (tx) => {
    const [exists] = await tx.query("select 1 from scoring_weight_sets where version = $1", [version]);
    if (exists) throw new ConflictError("That version already exists");
    await tx.query("update scoring_weight_sets set active = false where active");
    await tx.query("insert into scoring_weight_sets(version, weights, active, notes, created_by) values ($1,$2,true,$3,$4)", [
      version, JSON.stringify(weights), optStr(input.notes, 1000), ctx.user.id,
    ]);
    await logAudit(tx, ctx.user, "scoring_weight_set", null, "create_and_activate", null, { version, weights });
  });
}

export async function updateSettings(ctx: Ctx, input: Record<string, unknown>) {
  requireCap(ctx.user, "settings.manage");
  const rate = Math.round(reqNum(input.internal_hourly_cost_cents, "Internal hourly cost", { min: 0, int: true }));
  const owner = optStr(input.default_lead_owner_user_id, 64);
  if (owner) {
    const [u] = await ctx.db.query<{ role: string }>("select role from app_users where id = $1 and active", [owner]);
    if (!u || !["ADMIN_MANAGER", "SALES_REP"].includes(u.role)) throw new ValidationError("Default lead owner must be an active manager or sales rep");
  }
  await ctx.db.transaction(async (tx) => {
    for (const [key, value] of [["internal_hourly_cost_cents", rate], ["default_lead_owner_user_id", owner]] as const) {
      await tx.query(
        "insert into app_settings(key, value, updated_by, updated_at) values ($1,$2,$3,now()) on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()",
        [key, JSON.stringify(value), ctx.user.id],
      );
    }
    await logAudit(tx, ctx.user, "app_settings", null, "update", null, { internal_hourly_cost_cents: rate, default_lead_owner_user_id: owner });
  });
}

export async function getSettingsView(ctx: Ctx) {
  requireCap(ctx.user, "settings.manage");
  const rows = await ctx.db.query<{ key: string; value: unknown }>("select key, value from app_settings");
  return Object.fromEntries(rows.map((r) => [r.key, r.value])) as { internal_hourly_cost_cents?: number; default_lead_owner_user_id?: string | null };
}

export async function recentAuditLog(ctx: Ctx, limit = 100) {
  requireCap(ctx.user, "settings.manage");
  return ctx.db.query<{ id: number; actor_label: string | null; entity_type: string; entity_id: string | null; action: string; before_data: unknown; after_data: unknown; created_at: Date }>(
    "select id, actor_label, entity_type, entity_id, action, before_data, after_data, created_at from audit_log order by id desc limit $1",
    [limit],
  );
}
