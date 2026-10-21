import postgres from "postgres";
import type { Db, Executable } from "./types";

// Never pipeline a second query onto a busy connection: Supabase's transaction pooler (Supavisor)
// stalls on it. Seen as the admin dashboard hanging (9 parallel queries on a warm pool). Extra
// queries wait client-side for a free connection instead. `max_pipeline` is a real postgres.js
// option (node_modules/postgres/src/index.js) that its type definitions omit.
const NO_PIPELINING = { max_pipeline: 0 } as object;

const serializeJson =(x: unknown) => (typeof x === "string" ? x : JSON.stringify(x));

export interface PostgresOptions {
  /** Session search_path (startup parameter). Used by the opt-in real-Postgres test mode. */
  searchPath?: string;
  /** Pool size (default 5). */
  max?: number;
}

export function createPostgresDb(url: string, opts: PostgresOptions = {}): Db {
  const sql = postgres(url, {
    max: opts.max ?? 5,
    ...(opts.searchPath ? { connection: { search_path: opts.searchPath } } : {}),
    prepare: false, // compatible with Supabase transaction pooler
    ...NO_PIPELINING,
    onnotice: () => {}, // "already exists, skipping" etc. from idempotent DDL
    types: {
      bigint: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
      numeric: { to: 1700, from: [1700], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
      date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
      // Services pass json/jsonb params as JSON text (JSON.stringify), like PGlite expects.
      // postgres.js would stringify again and store a JSON *string*, so pass text through.
      json: { to: 114, from: [114], serialize: serializeJson, parse: (x: string) => JSON.parse(x) },
      jsonb: { to: 3802, from: [3802], serialize: serializeJson, parse: (x: string) => JSON.parse(x) },
    },
  });
  const wrap = (s: postgres.Sql | postgres.TransactionSql): Executable => ({
    async query<T>(text: string, params: unknown[] = []) {
      const rows = await s.unsafe(text, params as postgres.ParameterOrJSON<never>[]);
      return rows as unknown as T[];
    },
    // No params -> simple protocol, so multi-statement scripts are allowed.
    exec: async (script) => {
      await s.unsafe(script);
    },
  });
  return {
    ...wrap(sql),
    transaction: (fn) => sql.begin((tx) => fn(wrap(tx))) as never,
    close: () => sql.end(),
  };
}
