import fs from "node:fs";
import path from "node:path";
import type { Db } from "./types";

export const MIGRATIONS_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), "database", "migrations");

/** Applies pending SQL migrations in filename order. Each migration runs in its own transaction. */
export async function migrate(db: Db, dir = MIGRATIONS_DIR): Promise<string[]> {
  await db.exec(`create table if not exists schema_migrations (
    name text primary key, applied_at timestamptz not null default now())`);
  const applied = new Set(
    (await db.query<{ name: string }>("select name from schema_migrations")).map((r) => r.name),
  );
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const script = fs.readFileSync(path.join(/*turbopackIgnore: true*/ dir, file), "utf8");
    // Driver-managed transaction: postgres.js rejects hand-written BEGIN/COMMIT (UNSAFE_TRANSACTION).
    await db.transaction(async (tx) => {
      await tx.exec(script);
      await tx.query("insert into schema_migrations(name) values ($1)", [file]);
    });
    ran.push(file);
  }
  return ran;
}
