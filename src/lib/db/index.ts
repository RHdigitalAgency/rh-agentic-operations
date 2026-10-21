import path from "node:path";
import fs from "node:fs";
import type { Db } from "./types";
import { migrate } from "./migrate";

export type { Db, Queryable } from "./types";

const globalForDb = globalThis as unknown as { __rhDb?: Promise<Db> };

/**
 * Where the app's data lives:
 *  - DATABASE_URL set            -> Postgres (Supabase). Required on Vercel production.
 *  - Vercel preview, no URL      -> throwaway in-memory Postgres, auto-filled with demo data (never touches production).
 *  - local, no URL               -> embedded PGlite persisted under PGLITE_DATA_DIR.
 */
export type DbMode = "postgres" | "preview-memory" | "local-file";

export function dbMode(env: Record<string, string | undefined> = process.env): DbMode {
  if (env.DATABASE_URL) return "postgres";
  if (env.VERCEL_ENV === "production") throw new Error("DATABASE_URL is required in production");
  return env.VERCEL ? "preview-memory" : "local-file";
}

/**
 * Returns the process-wide database. Pending migrations are applied on first connection so a clean
 * environment works; preview databases are also seeded with demo data.
 */
export function getDb(): Promise<Db> {
  if (!globalForDb.__rhDb) {
    globalForDb.__rhDb = (async () => {
      const db = await openDb();
      await migrate(db);
      if (dbMode() === "preview-memory") await seedPreview(db);
      return db;
    })();
    globalForDb.__rhDb.catch(() => {
      globalForDb.__rhDb = undefined;
    });
  }
  return globalForDb.__rhDb;
}

export async function openDb(): Promise<Db> {
  const mode = dbMode();
  if (mode === "postgres") {
    const { createPostgresDb } = await import("./postgres");
    return createPostgresDb(process.env.DATABASE_URL!);
  }
  const { createPgliteDb } = await import("./pglite");
  if (mode === "preview-memory") return createPgliteDb();
  const dir = path.resolve(/*turbopackIgnore: true*/ process.env.PGLITE_DATA_DIR || "./.data/pglite");
  fs.mkdirSync(dir, { recursive: true });
  return createPgliteDb(dir);
}

async function seedPreview(db: Db) {
  const [{ n }] = await db.query<{ n: number }>("select count(*)::int as n from app_users");
  if (n > 0) return;
  const password = process.env.SEED_DEMO_PASSWORD;
  if (!password || password.length < 10) throw new Error("Preview deployments need SEED_DEMO_PASSWORD (10+ chars) for demo sign-in");
  const { seedDemo } = await import("@/server/seed");
  await seedDemo(db, password);
}
