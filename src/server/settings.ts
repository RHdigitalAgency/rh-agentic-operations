import type { Queryable } from "@/lib/db/types";

export async function getSetting<T>(db: Queryable, key: string, fallback: T): Promise<T> {
  const [row] = await db.query<{ value: T }>("select value from app_settings where key = $1", [key]);
  return row && row.value !== null ? row.value : fallback;
}

export async function getInternalHourlyCostCents(db: Queryable): Promise<number> {
  return Number(await getSetting(db, "internal_hourly_cost_cents", 4000));
}

export async function getDefaultLeadOwner(db: Queryable): Promise<string | null> {
  const id = await getSetting<string | null>(db, "default_lead_owner_user_id", null);
  if (!id) return null;
  const [u] = await db.query<{ id: string }>("select id from app_users where id = $1 and active", [id]);
  return u?.id ?? null;
}
