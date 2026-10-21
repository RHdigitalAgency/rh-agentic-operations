import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCtx } from "@/lib/auth/current";
import { AppError } from "@/lib/errors";
import { parseMoneyToCents } from "@/domain/money";
import type { Ctx } from "@/server/context";

function withMessage(path: string, key: "ok" | "error", msg: string) {
  const [base, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.delete("ok");
  params.delete("error");
  params.set(key, msg.slice(0, 300));
  return `${base}?${params.toString()}`;
}

/**
 * Converts FormData into a plain object. Inputs named `<field>__money` are user-entered amounts
 * (e.g. "1,250.00") and become integer cents under `<field>_cents`.
 */
export function formObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("$ACTION")) continue;
    if (typeof v !== "string") continue;
    if (k.endsWith("__money")) out[`${k.slice(0, -7)}_cents`] = parseMoneyToCents(v, k.slice(0, -7).replace(/_/g, " "));
    else out[k] = v;
  }
  return out;
}

/**
 * Runs a mutation for a form post. Domain errors are shown on `back` as a banner; success redirects
 * to `next(result)` (or `back`). Every write goes through the service layer, which enforces RBAC.
 */
export async function run<T>(
  back: string,
  fn: (ctx: Ctx) => Promise<T>,
  opts: { success?: string; next?: (result: T) => string } = {},
): Promise<never> {
  let target: string;
  try {
    const ctx = await requireCtx();
    const result = await fn(ctx);
    target = withMessage(opts.next ? opts.next(result) : back, "ok", opts.success ?? "Saved");
  } catch (e) {
    if (e instanceof AppError) target = withMessage(back, "error", e.message);
    else throw e;
  }
  revalidatePath("/", "layout");
  redirect(target);
}
