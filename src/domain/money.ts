import { ValidationError } from "@/lib/errors";

/** Money is always integer cents + ISO 4217 currency code. Never floats for stored values. */
export function parseMoneyToCents(input: string | number | null | undefined, field = "amount"): number | null {
  if (input === null || input === undefined) return null;
  const raw = String(input).trim().replace(/[,\s$]/g, "");
  if (raw === "") return null;
  if (!/^-?\d+(\.\d{1,2})?$/.test(raw)) throw new ValidationError(`${field} must be a number with at most 2 decimals`);
  const negative = raw.startsWith("-");
  const [whole, frac = ""] = raw.replace("-", "").split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) throw new ValidationError(`${field} is too large`);
  return negative ? -cents : cents;
}

export function formatCents(cents: number | null | undefined, currency = "USD"): string {
  if (cents === null || cents === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2);
}

export function normalizeCurrency(code: string | null | undefined, fallback = "USD"): string {
  const c = (code || fallback).trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(c)) throw new ValidationError("currency must be a 3-letter ISO code");
  return c;
}

/** Gross margin = (revenue - cost) / revenue. Null when there is no revenue. */
export function grossMargin(revenueCents: number, costCents: number): number | null {
  if (revenueCents <= 0) return null;
  return (revenueCents - costCents) / revenueCents;
}

/** Delivery cost = internal hours x internal loaded hourly cost + direct cost. Rounded to whole cents. */
export function deliveryCostCents(hours: number, internalHourlyCostCents: number, directCostCents: number): number {
  return Math.round(hours * internalHourlyCostCents) + directCostCents;
}

export function baseCurrency(): string {
  return normalizeCurrency(process.env.APP_BASE_CURRENCY, "USD");
}
