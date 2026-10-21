import { createHash, randomBytes } from "node:crypto";
import type { Queryable } from "@/lib/db/types";
import type { SessionUser } from "./user";
import type { Role } from "./roles";
import { verifyPassword } from "./password";

export const SESSION_COOKIE = "rh_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
/** Sessions are stored by token hash only. */
export const hashSessionToken = sha256;

type UserRow = { id: string; email: string; full_name: string | null; role: Role };
const toSessionUser = (r: UserRow): SessionUser => ({ id: r.id, email: r.email, fullName: r.full_name, role: r.role });

export async function authenticate(db: Queryable, email: string, password: string): Promise<SessionUser | null> {
  const [row] = await db.query<UserRow & { password_hash: string | null; active: boolean }>(
    "select id, email, full_name, role, password_hash, active from app_users where lower(email) = lower($1)",
    [email.trim()],
  );
  const ok = verifyPassword(password, row?.password_hash);
  if (!row || !row.active || !ok) return null;
  return toSessionUser(row);
}

/** Only a SHA-256 of the session token is stored; the raw token lives in an httpOnly cookie. */
export async function createSession(db: Queryable, userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.query("delete from user_sessions where user_id = $1 and expires_at < now()", [userId]);
  await db.query("insert into user_sessions(token_hash, user_id, expires_at) values ($1, $2, $3)", [sha256(token), userId, expiresAt]);
  return { token, expiresAt };
}

export async function getSessionUser(db: Queryable, token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const [row] = await db.query<UserRow>(
    `select u.id, u.email, u.full_name, u.role from user_sessions s join app_users u on u.id = s.user_id
     where s.token_hash = $1 and s.expires_at > now() and u.active`,
    [sha256(token)],
  );
  return row ? toSessionUser(row) : null;
}

export async function deleteSession(db: Queryable, token: string): Promise<void> {
  await db.query("delete from user_sessions where token_hash = $1", [sha256(token)]);
}

export const LOCKOUT_MAX_FAILURES = 5;
export const LOCKOUT_WINDOW_MINUTES = 15;

export type SignInResult = { ok: true; user: SessionUser } | { ok: false; reason: "invalid" | "locked" };

/**
 * Password sign-in with lockout: after LOCKOUT_MAX_FAILURES failed attempts for an email within the window
 * (and no success since), further attempts are refused until the window passes. Every attempt is recorded.
 */
export async function signIn(db: Queryable, email: string, password: string): Promise<SignInResult> {
  const normalized = email.trim().toLowerCase();
  const [{ failures }] = await db.query<{ failures: number }>(
    `select count(*)::int as failures from login_attempts
     where lower(email) = $1 and not succeeded and created_at > now() - make_interval(mins => $2)
       and created_at > coalesce((select max(created_at) from login_attempts where lower(email) = $1 and succeeded), '-infinity'::timestamptz)`,
    [normalized, LOCKOUT_WINDOW_MINUTES],
  );
  if (failures >= LOCKOUT_MAX_FAILURES) return { ok: false, reason: "locked" };
  const user = await authenticate(db, normalized, password);
  await db.query("insert into login_attempts(email, succeeded) values ($1, $2)", [normalized, Boolean(user)]);
  return user ? { ok: true, user } : { ok: false, reason: "invalid" };
}
