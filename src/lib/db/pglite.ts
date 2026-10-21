import { PGlite, types } from "@electric-sql/pglite";
import type { Db, Executable } from "./types";

// Normalize types so both drivers return identical shapes:
// int8 + numeric -> number (money is integer cents, well within 2^53), date -> 'YYYY-MM-DD'.
const parsers = {
  [types.INT8]: (v: string) => Number(v),
  [types.NUMERIC]: (v: string) => Number(v),
  [types.DATE]: (v: string) => v,
};

export async function createPgliteDb(dataDir?: string): Promise<Db> {
  // Single options object: PGlite ignores the options argument when dataDir is undefined.
  const pg = new PGlite({ dataDir, parsers });
  await pg.waitReady;
  const wrap = (q: Pick<PGlite, "query" | "exec">): Executable => ({
    async query<T>(text: string, params: unknown[] = []) {
      const res = await q.query<T>(text, params);
      return res.rows;
    },
    exec: async (script) => {
      await q.exec(script);
    },
  });
  return {
    ...wrap(pg),
    transaction: (fn) => pg.transaction((tx) => fn(wrap(tx))),
    close: () => pg.close(),
  };
}
