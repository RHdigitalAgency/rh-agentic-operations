import fs from "node:fs";
import path from "node:path";
import type { Db, Executable } from "./types";

export const MIGRATIONS_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), "database", "migrations");

// Arbitrary constant: serializes migration runs across processes (serverless cold starts can overlap).
const MIGRATION_LOCK_ID = 727_274_001;

const lock = (tx: Executable) => tx.query("select pg_advisory_xact_lock($1)", [MIGRATION_LOCK_ID]);

/**
 * Applies pending SQL migrations in filename order. Each migration runs in its own transaction under a
 * transaction-scoped advisory lock (works through the transaction pooler) and re-checks whether another process
 * applied it while this one waited, so concurrent starts never run a migration twice.
 */
export async function migrate(db: Db, dir = MIGRATIONS_DIR): Promise<string[]> {
  await db.transaction(async (tx) => {
    await lock(tx);
    await tx.exec(`create table if not exists schema_migrations (
      name text primary key, applied_at timestamptz not null default now())`);
  });
  const applied = new Set((await db.query<{ name: string }>("select name from schema_migrations")).map((r) => r.name));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const script = fs.readFileSync(path.join(/*turbopackIgnore: true*/ dir, file), "utf8");
    // Driver-managed transaction: postgres.js rejects hand-written BEGIN/COMMIT (UNSAFE_TRANSACTION).
    const didRun = await db.transaction(async (tx) => {
      await lock(tx);
      const [done] = await tx.query("select 1 from schema_migrations where name = $1", [file]);
      if (done) return false;
      await tx.exec(script);
      await tx.query("insert into schema_migrations(name) values ($1)", [file]);
      return true;
    });
    if (didRun) ran.push(file);
  }
  return ran;
}
