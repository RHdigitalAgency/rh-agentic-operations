/** Minimal driver-agnostic database contract. All SQL uses $1..$n positional params. */
export interface Queryable {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

export interface Executable extends Queryable {
  /** Execute a multi-statement SQL script (migrations). Must not contain BEGIN/COMMIT. */
  exec(script: string): Promise<void>;
}

export interface Db extends Executable {
  transaction<T>(fn: (tx: Executable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
