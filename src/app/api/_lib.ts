import "server-only";
import { NextResponse } from "next/server";
import { apiCtx } from "@/lib/auth/current";
import { AppError } from "@/lib/errors";
import type { Ctx } from "@/server/context";

export function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** Authenticated internal API: session cookie required; RBAC enforced by the service layer. */
export async function withCtx(fn: (ctx: Ctx) => Promise<unknown>) {
  const ctx = await apiCtx();
  if (!ctx) return jsonError(401, "UNAUTHENTICATED", "Authentication required");
  try {
    const data = await fn(ctx);
    return data instanceof Response ? data : NextResponse.json({ data });
  } catch (e) {
    if (e instanceof AppError) return jsonError(e.status, e.code, e.message);
    console.error(e);
    return jsonError(500, "INTERNAL", "Unexpected error");
  }
}
