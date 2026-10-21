import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "@/lib/db/migrate";
import type { Db } from "@/lib/db/types";
import { createTestDb } from "../helpers";

// Parameter round-trips the services rely on. Runs on PGlite by default and on the
// postgres.js driver when TEST_DATABASE_URL is set.
describe("driver parameter handling", () => {
  let db: Db;
  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db);
  });
  afterAll(() => db.close());

  it("round-trips text[] params, including empty arrays and quoting", async () => {
    const [row] = await db.query<{ a: string[]; b: string[] }>("select $1::text[] as a, $2::text[] as b", [["Jobber", "Gmail, \"x\"", "{y}"], []]);
    expect(row).toEqual({ a: ["Jobber", "Gmail, \"x\"", "{y}"], b: [] });
  });

  it("round-trips jsonb params passed as JSON strings, and int8/numeric/date parsing", async () => {
    const [row] = await db.query<{ j: unknown; n: number; i: number; d: string }>(
      "select $1::jsonb as j, 12.5::numeric as n, 9007199254740::int8 as i, '2026-10-20'::date as d",
      [JSON.stringify({ a: 1, b: [true, null], s: "it's" })],
    );
    expect(row).toEqual({ j: { a: 1, b: [true, null], s: "it's" }, n: 12.5, i: 9007199254740, d: "2026-10-20" });
  });

  it("serves a burst of parallel queries on a warm pool (dashboard pattern)", async () => {
    // Regression: with pipelining, Supabase's transaction pooler hung on exactly this shape.
    await db.query("select 1");
    const rows = await Promise.all(Array.from({ length: 12 }, (_, i) => db.query<{ i: number }>(`select ${i}::int as i from opportunities where false union all select ${i}`)));
    expect(rows.map((r) => r[0].i)).toEqual(Array.from({ length: 12 }, (_, i) => i));
  });

  it("works through untyped params into text[] and jsonb columns, inside a transaction", async () => {
    const [u] = await db.query<{ id: string }>("insert into app_users(email, full_name, role) values ($1,$2,$3) returning id", ["drv@test.example.com", "Driver", "ADMIN_MANAGER"]);
    await db.transaction(async (tx) => {
      await tx.query("insert into app_settings(key, value, updated_by) values ($1, $2, $3)", ["drv_test", JSON.stringify({ k: [1, 2] }), u.id]);
    });
    const [s] = await db.query<{ value: unknown }>("select value from app_settings where key = $1", ["drv_test"]);
    expect(s.value).toEqual({ k: [1, 2] });
  });
});
