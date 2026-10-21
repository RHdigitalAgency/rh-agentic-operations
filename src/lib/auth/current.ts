import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { getDb } from "@/lib/db";
import type { Ctx } from "@/server/context";
import { getSessionUser, SESSION_COOKIE } from "./session";
import type { SessionUser } from "./user";

/** Per-request memoized lookup of the signed-in user from the session cookie. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return getSessionUser(await getDb(), token);
});

/** For pages: redirects to /login when not signed in. */
export async function requireCtx(): Promise<Ctx> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return { db: await getDb(), user };
}

/** For API routes: returns null instead of redirecting. */
export async function apiCtx(): Promise<Ctx | null> {
  const user = await getCurrentUser();
  return user ? { db: await getDb(), user } : null;
}

/** Page helper: records outside the caller's scope (or missing) render the 404 page instead of leaking details. */
export async function load<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof NotFoundError || e instanceof ForbiddenError) notFound();
    throw e;
  }
}
