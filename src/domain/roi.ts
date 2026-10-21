import { z } from "zod";
import { ValidationError } from "@/lib/errors";

export const ROI_MODEL_VERSION = "roi-v1";

const cents = z.number().int().min(0);
const pct = z.number().min(0).max(100);

/**
 * ROI assumptions (PDR §9). Uncertain recovery rates are entered as low/high ranges.
 * All money in integer cents. Percentages are 0..100.
 */
export const RoiAssumptionsSchema = z
  .object({
    // Current labor
    labor_hours_per_month: z.number().min(0),
    loaded_hourly_cost_cents: cents,
    people_involved: z.number().int().min(0).optional(),
    capacity_recovered_pct_low: pct,
    capacity_recovered_pct_high: pct,
    // Revenue leakage
    leakage_monthly_cents: cents,
    leakage_recovered_pct_low: pct,
    leakage_recovered_pct_high: pct,
    // Quality cost
    quality_cost_monthly_cents: cents,
    quality_reduction_pct_low: pct,
    quality_reduction_pct_high: pct,
    // Future state
    platform_cost_monthly_cents: cents,
    supervision_hours_per_month: z.number().min(0),
    // Implementation
    rh_implementation_fee_cents: cents,
    client_setup_cost_cents: cents,
    notes: z.string().max(4000).optional(),
  })
  .superRefine((a, ctx) => {
    for (const k of ["capacity_recovered_pct", "leakage_recovered_pct", "quality_reduction_pct"] as const) {
      if (a[`${k}_low`] > a[`${k}_high`]) ctx.addIssue({ code: "custom", message: `${k} low must be <= high`, path: [`${k}_low`] });
    }
  });
export type RoiAssumptions = z.infer<typeof RoiAssumptionsSchema>;

export interface RoiResult {
  monthly_value_low_cents: number;
  monthly_value_high_cents: number;
  annual_value_low_cents: number;
  annual_value_high_cents: number;
  implementation_cost_cents: number;
  /** Payback in months: low = best case (high value), high = worst case. Null if value never pays back. */
  payback_months_low: number | null;
  payback_months_high: number | null;
  /** First-year ROI as a ratio: (annual value - implementation) / implementation. Null when implementation is 0. */
  roi_low: number | null;
  roi_high: number | null;
  breakdown: {
    labor_low_cents: number;
    labor_high_cents: number;
    leakage_low_cents: number;
    leakage_high_cents: number;
    quality_low_cents: number;
    quality_high_cents: number;
    future_state_monthly_cost_cents: number;
  };
}

export function parseRoiAssumptions(input: unknown): RoiAssumptions {
  const r = RoiAssumptionsSchema.safeParse(input);
  if (!r.success) throw new ValidationError(r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return r.data;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Estimates only. Never present as guaranteed savings or revenue. */
export function calculateRoi(input: unknown): RoiResult {
  const a = parseRoiAssumptions(input);
  const laborMonthly = a.labor_hours_per_month * a.loaded_hourly_cost_cents;
  const labor_low = Math.round((laborMonthly * a.capacity_recovered_pct_low) / 100);
  const labor_high = Math.round((laborMonthly * a.capacity_recovered_pct_high) / 100);
  const leakage_low = Math.round((a.leakage_monthly_cents * a.leakage_recovered_pct_low) / 100);
  const leakage_high = Math.round((a.leakage_monthly_cents * a.leakage_recovered_pct_high) / 100);
  const quality_low = Math.round((a.quality_cost_monthly_cents * a.quality_reduction_pct_low) / 100);
  const quality_high = Math.round((a.quality_cost_monthly_cents * a.quality_reduction_pct_high) / 100);
  const futureCost = a.platform_cost_monthly_cents + Math.round(a.supervision_hours_per_month * a.loaded_hourly_cost_cents);

  const monthlyLow = labor_low + leakage_low + quality_low - futureCost;
  const monthlyHigh = labor_high + leakage_high + quality_high - futureCost;
  const impl = a.rh_implementation_fee_cents + a.client_setup_cost_cents;

  const payback = (monthly: number) => (monthly > 0 ? round2(impl / monthly) : null);
  const roi = (monthly: number) => (impl > 0 ? round2((monthly * 12 - impl) / impl) : null);

  return {
    monthly_value_low_cents: monthlyLow,
    monthly_value_high_cents: monthlyHigh,
    annual_value_low_cents: monthlyLow * 12,
    annual_value_high_cents: monthlyHigh * 12,
    implementation_cost_cents: impl,
    payback_months_low: payback(monthlyHigh),
    payback_months_high: payback(monthlyLow),
    roi_low: roi(monthlyLow),
    roi_high: roi(monthlyHigh),
    breakdown: {
      labor_low_cents: labor_low,
      labor_high_cents: labor_high,
      leakage_low_cents: leakage_low,
      leakage_high_cents: leakage_high,
      quality_low_cents: quality_low,
      quality_high_cents: quality_high,
      future_state_monthly_cost_cents: futureCost,
    },
  };
}
