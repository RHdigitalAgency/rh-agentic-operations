import type { Db } from "@/lib/db/types";
import { seedDemo } from "./seed";

/**
 * Removable demo dataset for a hosted (real) database, so the UI can be reviewed with data.
 * Everything added is registered in app_settings.demo_dataset; removeDemoData deletes exactly that.
 */
interface DemoRegistry {
  added_at: string;
  user_ids: string[];
  company_ids: string[];
  integration_event_ids: string[];
  audit_log_id_range: [number, number];
}

const ids = async (db: Db, sql: string) => (await db.query<{ id: string }>(sql)).map((r) => String(r.id));

export async function addDemoData(db: Db, log: (m: string) => void = () => {}): Promise<DemoRegistry> {
  const [existing] = await db.query("select 1 from app_settings where key = 'demo_dataset'");
  if (existing) throw new Error("Demo data is already present. Run `npm run demo:remove` first.");
  const usersBefore = new Set(await ids(db, "select id from app_users"));
  const companiesBefore = new Set(await ids(db, "select id from companies"));
  const eventsBefore = new Set(await ids(db, "select id from integration_events"));
  const [{ max: logBefore }] = await db.query<{ max: number }>("select coalesce(max(id), 0)::int8 as max from audit_log");

  await seedDemo(db, null, log, { mode: "hosted-demo" });

  const [{ max: logAfter }] = await db.query<{ max: number }>("select coalesce(max(id), 0)::int8 as max from audit_log");
  const registry: DemoRegistry = {
    added_at: new Date().toISOString(),
    user_ids: (await ids(db, "select id from app_users")).filter((id) => !usersBefore.has(id)),
    company_ids: (await ids(db, "select id from companies")).filter((id) => !companiesBefore.has(id)),
    integration_event_ids: (await ids(db, "select id from integration_events")).filter((id) => !eventsBefore.has(id)),
    audit_log_id_range: [Number(logBefore) + 1, Number(logAfter)],
  };
  await db.query("insert into app_settings(key, value) values ('demo_dataset', $1)", [JSON.stringify(registry)]);
  return registry;
}

export async function removeDemoData(db: Db): Promise<{ companies: number; users: number }> {
  const [row] = await db.query<{ value: DemoRegistry }>("select value from app_settings where key = 'demo_dataset'");
  if (!row) throw new Error("No demo data registered on this database.");
  const r = row.value;
  await db.transaction(async (tx) => {
    // Companies cascade to opportunities, audits, processes, proposals, deployments, retainers, activities, KPIs.
    await tx.query("delete from contacts where company_id = any($1::uuid[])", [r.company_ids]);
    await tx.query("delete from companies where id = any($1::uuid[])", [r.company_ids]);
    await tx.query("delete from integration_events where id = any($1::uuid[])", [r.integration_event_ids]);
    await tx.query("delete from audit_log where (id between $1 and $2) or actor_user_id = any($3::uuid[])", [r.audit_log_id_range[0], r.audit_log_id_range[1], r.user_ids]);
    await tx.query("delete from user_sessions where user_id = any($1::uuid[])", [r.user_ids]);
    await tx.query("delete from app_users where id = any($1::uuid[])", [r.user_ids]);
    await tx.query("delete from app_settings where key = 'demo_dataset'");
  });
  return { companies: r.company_ids.length, users: r.user_ids.length };
}
