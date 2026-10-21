import type { Db, Queryable } from "@/lib/db/types";
import type { SessionUser } from "@/lib/auth/user";
import { scopeOf } from "@/lib/auth/user";
import { assertFound } from "@/lib/errors";

/** Every service call runs with a database handle and the authenticated caller. */
export interface Ctx {
  db: Db;
  user: SessionUser;
}

/** Builds positional parameters ($1, $2, ...) while composing SQL fragments. */
export class Sql {
  params: unknown[] = [];
  p(v: unknown): string {
    this.params.push(v);
    return `$${this.params.length}`;
  }
}

/** SQL predicate: is company `alias` visible to the user? (data-level RBAC) */
export function companyVisible(q: Sql, user: SessionUser, alias: string): string {
  switch (scopeOf(user)) {
    case "ALL":
      return "true";
    case "OWNED": {
      const me = q.p(user.id);
      return `(${alias}.owner_user_id = ${me} or exists (select 1 from opportunities ox where ox.company_id = ${alias}.id and ox.owner_user_id = ${me}))`;
    }
    case "ASSIGNED": {
      const me = q.p(user.id);
      return `exists (select 1 from deployments dx where dx.company_id = ${alias}.id and dx.owner_user_id = ${me})`;
    }
    default:
      return "false";
  }
}

/** SQL predicate: is opportunity `oAlias` visible? Partners see only owned/attributed opportunities. */
export function opportunityVisible(q: Sql, user: SessionUser, oAlias: string, cAlias: string): string {
  if (scopeOf(user) === "ATTRIBUTED") {
    const me = q.p(user.id);
    return `(${oAlias}.owner_user_id = ${me} or ${oAlias}.referrer_user_id = ${me})`;
  }
  return companyVisible(q, user, cAlias);
}

/** Throws NotFound unless the company exists, is not archived, and is visible to the caller. */
export async function assertCompanyVisible(db: Queryable, user: SessionUser, companyId: string) {
  const q = new Sql();
  const row = (
    await db.query<{ id: string; name: string; vertical: string | null }>(
      `select c.id, c.name, c.vertical from companies c where c.id = ${q.p(companyId)} and c.archived_at is null and ${companyVisible(q, user, "c")}`,
      q.params,
    )
  )[0];
  return assertFound(row, "Company");
}

export async function logAudit(
  db: Queryable,
  user: SessionUser | null,
  entityType: string,
  entityId: string | null,
  action: string,
  before: unknown,
  after: unknown,
  actorLabel?: string,
): Promise<void> {
  await db.query(
    `insert into audit_log(actor_user_id, actor_label, entity_type, entity_id, action, before_data, after_data)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      user?.id ?? null,
      actorLabel ?? user?.email ?? null,
      entityType,
      entityId,
      action,
      before === undefined || before === null ? null : JSON.stringify(before),
      after === undefined || after === null ? null : JSON.stringify(after),
    ],
  );
}

export const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
