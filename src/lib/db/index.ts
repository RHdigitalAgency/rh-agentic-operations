import path from "node:path";
import fs from "node:fs";
import type { Db } from "./types";
import { migrate } from "./migrate";

export type { Db, Queryable } from "./types";

const globalForDb = globalThis as unknown as { __rhDb?: Promise<Db> };

/**
 * Returns the process-wide database. DATABASE_URL -> Postgres (e.g. Supabase);
 * otherwise an embedded PGlite instance persisted under PGLITE_DATA_DIR.
 * Pending migrations are applied on first connection so a clean environment works.
 */
export function getDb(): Promise<Db> {
  if (!globalForDb.__rhDb) {
    globalForDb.__rhDb = (async () => {
      const db = await openDb();
      await migrate(db);
      return db;
    })();
    globalForDb.__rhDb.catch(() => {
      globalForDb.__rhDb = undefined;
    });
  }
  return globalForDb.__rhDb;
}

export async function openDb(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { createPostgresDb } = await import("./postgres");
    return createPostgresDb(url);
  }
  const dir = path.resolve(/*turbopackIgnore: true*/ process.env.PGLITE_DATA_DIR || "./.data/pglite");
  fs.mkdirSync(dir, { recursive: true });
  const { createPgliteDb } = await import("./pglite");
  return createPgliteDb(dir);
}
