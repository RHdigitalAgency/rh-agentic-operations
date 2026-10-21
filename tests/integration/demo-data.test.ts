import { describe, expect, it } from "vitest";
import { migrate } from "@/lib/db/migrate";
import { addDemoData, removeDemoData } from "@/server/demo-data";
import { authenticate } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { createTestDb } from "../helpers";

const counts = async (db: Awaited<ReturnType<typeof createTestDb>>) =>
  (await db.query<Record<string, number>>(
    `select (select count(*) from app_users)::int as users, (select count(*) from companies)::int as companies,
            (select count(*) from opportunities)::int as opps, (select count(*) from audits)::int as audits,
            (select count(*) from deployments)::int as deployments, (select count(*) from contacts)::int as contacts,
            (select count(*) from audit_log)::int as log, (select count(*) from integration_events)::int as events`,
  ))[0];

describe("removable demo data on a hosted database", () => {
  it("adds a full dataset next to real data, demo users cannot sign in, and removal restores the exact prior state", async () => {
    const db = await createTestDb();
    await migrate(db);
    // A "real" production state: one admin, one real company, an intake setting.
    const [admin] = await db.query<{ id: string }>("insert into app_users(email, full_name, role, password_hash) values ('owner@rh.example', 'Owner', 'ADMIN_MANAGER', $1) returning id", [hashPassword("real-owner-password")]);
    await db.query("insert into companies(name) values ('Real Client LLC')");
    await db.query("update app_settings set value = $1 where key = 'default_lead_owner_user_id'", [JSON.stringify(admin.id)]);
    const before = await counts(db);

    const reg = await addDemoData(db);
    const during = await counts(db);
    expect(during.opps).toBeGreaterThan(10);
    expect(during.deployments).toBeGreaterThan(0);
    expect(reg.company_ids.length).toBe(during.companies - before.companies);
    const demoUsers = await db.query<{ active: boolean; password_hash: string | null }>("select active, password_hash from app_users where id = any($1::uuid[])", [reg.user_ids]);
    expect(demoUsers.every((u) => !u.active && u.password_hash === null)).toBe(true);
    expect(await authenticate(db, "admin@demo.example.com", "rh-local-demo")).toBeNull();
    const [setting] = await db.query<{ value: string }>("select value from app_settings where key = 'default_lead_owner_user_id'");
    expect(setting.value).toBe(admin.id); // intake setting restored
    await expect(addDemoData(db)).rejects.toThrow(/already present/);

    await removeDemoData(db);
    expect(await counts(db)).toEqual(before);
    expect((await db.query("select 1 from companies where name = 'Real Client LLC'")).length).toBe(1);
    await expect(removeDemoData(db)).rejects.toThrow(/No demo data/);
    await db.close();
  });
});
