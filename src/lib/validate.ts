import { ValidationError } from "@/lib/errors";
import { parseLocalDateTime, zonedDay } from "./time";

/** Small coercion helpers for form / JSON input. Empty strings become null. */
type In = unknown;

export function optStr(v: In, max = 2000): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === "") return null;
  if (s.length > max) throw new ValidationError(`Value too long (max ${max} characters)`);
  return s;
}

export function reqStr(v: In, field: string, max = 2000): string {
  const s = optStr(v, max);
  if (!s) throw new ValidationError(`${field} is required`);
  return s;
}

export function optNum(v: In, field: string, opts: { min?: number; max?: number; int?: boolean } = {}): number | null {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(String(v).replace(/,/g, ""));
  if (!Number.isFinite(n)) throw new ValidationError(`${field} must be a number`);
  if (opts.int && !Number.isInteger(n)) throw new ValidationError(`${field} must be a whole number`);
  if (opts.min !== undefined && n < opts.min) throw new ValidationError(`${field} must be >= ${opts.min}`);
  if (opts.max !== undefined && n > opts.max) throw new ValidationError(`${field} must be <= ${opts.max}`);
  return n;
}

export function reqNum(v: In, field: string, opts: { min?: number; max?: number; int?: boolean } = {}): number {
  const n = optNum(v, field, opts);
  if (n === null) throw new ValidationError(`${field} is required`);
  return n;
}

/**
 * Accepts ISO strings / Date / datetime-local values. Zone-less wall-clock values ("2026-10-22T09:00", what
 * <input type="datetime-local"> submits) are business-zone time — never the server's UTC.
 */
export function optDate(v: In, field: string): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const d = v instanceof Date ? v : parseLocalDateTime(String(v).trim()) ?? new Date(String(v));
  if (Number.isNaN(d.getTime())) throw new ValidationError(`${field} must be a valid date`);
  return d;
}

/** Calendar date (YYYY-MM-DD) or null. */
export function optDay(v: In, field: string): string | null {
  const s = optStr(v, 40);
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(new Date(s).getTime())) throw new ValidationError(`${field} must be a date (YYYY-MM-DD)`);
  return s;
}

export function oneOf<T extends string>(v: In, allowed: readonly T[], field: string): T {
  if (typeof v !== "string" || !allowed.includes(v as T)) throw new ValidationError(`${field} must be one of: ${allowed.join(", ")}`);
  return v as T;
}

export function optOneOf<T extends string>(v: In, allowed: readonly T[], field: string): T | null {
  if (v === null || v === undefined || v === "") return null;
  return oneOf(v, allowed, field);
}

export function bool(v: In): boolean {
  return v === true || v === "true" || v === "on" || v === "1" || v === "yes";
}

export function optList(v: In): string[] {
  const s = optStr(v, 4000);
  return s ? s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean) : [];
}

export function optEmail(v: In): string | null {
  const s = optStr(v, 320);
  if (s && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new ValidationError("Invalid email address");
  return s?.toLowerCase() ?? null;
}

export function optUrl(v: In, field = "URL"): string | null {
  const s = optStr(v, 2000);
  if (!s) return null;
  try {
    const u = new URL(s.includes("://") ? s : `https://${s}`);
    if (!["http:", "https:"].includes(u.protocol)) throw new Error();
    return u.toString();
  } catch {
    throw new ValidationError(`${field} must be a valid http(s) URL`);
  }
}

/** Today's calendar date (YYYY-MM-DD) in the business time zone. */
export function todayLocal(): string {
  return zonedDay();
}
