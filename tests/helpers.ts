import { randomBytes } from "node:crypto";
import { createPgliteDb } from "@/lib/db/pglite";
import { migrate } from "@/lib/db/migrate";
import type { Db } from "@/lib/db/types";
import type { Role } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/user";
import type { Ctx } from "@/server/context";

export interface TestEnv {
  db: Db;
  users: Record<string, SessionUser>;
  as: (key: string) => Ctx;
}

const TEST_USERS: [string, Role, string][] = [
  ["admin", "ADMIN_MANAGER", "Admin Manager"],
  ["sales", "SALES_REP", "Sam Sales"],
  ["sales2", "SALES_REP", "Other Sales"],
  ["delivery", "DELIVERY", "Dana Delivery"],
  ["delivery2", "DELIVERY", "Other Delivery"],
  ["analyst", "AUDITOR_ANALYST", "Ann Analyst"],
  ["partner", "EXTERNAL_REP", "Pat Partner"],
  ["exec", "READ_ONLY_EXECUTIVE", "Eve Exec"],
];

const openTestDbs: Db[] = [];

/**
 * Fresh, empty database. Default: in-memory PGlite. Opt-in: set TEST_DATABASE_URL to a real
 * Postgres (use a session-mode/direct URL, not the transaction pooler, so search_path sticks);
 * each call then gets a disposable schema that is dropped by closeTestDbs().
 */
export async function createTestDb(): Promise<Db> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return createPgliteDb();
  const { createPostgresDb } = await import("@/lib/db/postgres");
  const schema = `rh_test_${randomBytes(6).toString("hex")}`;
  const admin = createPostgresDb(url, { max: 1 });
  await admin.exec(`create schema ${schema}`);
  await admin.close();
  const inner = createPostgresDb(url, { searchPath: `${schema}, public`, max: 2 });
  let closed = false;
  const db: Db = {
    ...inner,
    close: async () => {
      if (closed) return;
      closed = true;
      await inner.exec(`drop schema ${schema} cascade`);
      await inner.close();
    },
  };
  openTestDbs.push(db);
  return db;
}

/** Drops every disposable schema created by this test file (registered in tests/setup.ts). */
export async function closeTestDbs(): Promise<void> {
  await Promise.all(openTestDbs.splice(0).map((db) => db.close()));
}

/** Fresh, fully migrated Postgres per test file (also proves migrations apply from zero). */
export async function setupTestEnv(): Promise<TestEnv> {
  const db = await createTestDb();
  await migrate(db);
  const users: Record<string, SessionUser> = {};
  for (const [key, role, name] of TEST_USERS) {
    const email = `${key}@test.example.com`;
    const [row] = await db.query<{ id: string }>("insert into app_users(email, full_name, role) values ($1,$2,$3) returning id", [email, name, role]);
    users[key] = { id: row.id, email, fullName: name, role };
  }
  return { db, users, as: (key) => ({ db, user: users[key] }) };
}

/** Minimal valid raw scores for an agent-ready process. */
export const GOOD_SCORES = {
  economic_impact: 5,
  frequency_volume: 5,
  repetitiveness: 4,
  data_availability: 4,
  rule_clarity: 4,
  human_judgment_required: 2,
  error_consequence: 2,
  implementation_difficulty: 2,
  time_to_value: 4,
};

export const ROI_ASSUMPTIONS = {
  labor_hours_per_month: 120,
  loaded_hourly_cost_cents: 2500,
  capacity_recovered_pct_low: 40,
  capacity_recovered_pct_high: 70,
  leakage_monthly_cents: 800000,
  leakage_recovered_pct_low: 20,
  leakage_recovered_pct_high: 40,
  quality_cost_monthly_cents: 100000,
  quality_reduction_pct_low: 10,
  quality_reduction_pct_high: 30,
  platform_cost_monthly_cents: 30000,
  supervision_hours_per_month: 8,
  rh_implementation_fee_cents: 450000,
  client_setup_cost_cents: 50000,
};
