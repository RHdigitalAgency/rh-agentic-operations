import { describe, expect, it } from "vitest";
import { calculateRoi } from "@/domain/roi";
import { ROI_ASSUMPTIONS } from "../helpers";

describe("ROI engine", () => {
  it("computes low/high monthly value from editable assumptions", () => {
    const r = calculateRoi(ROI_ASSUMPTIONS);
    // labor 120h * $25 = $3,000/mo -> 40%..70% = $1,200..$2,100
    expect(r.breakdown.labor_low_cents).toBe(120000);
    expect(r.breakdown.labor_high_cents).toBe(210000);
    // leakage $8,000 * 20..40% = $1,600..$3,200 ; quality $1,000 * 10..30% = $100..$300
    expect(r.breakdown.leakage_low_cents).toBe(160000);
    expect(r.breakdown.quality_high_cents).toBe(30000);
    // future state: platform $300 + supervision 8h * $25 = $500
    expect(r.breakdown.future_state_monthly_cost_cents).toBe(50000);
    expect(r.monthly_value_low_cents).toBe(120000 + 160000 + 10000 - 50000);
    expect(r.monthly_value_high_cents).toBe(210000 + 320000 + 30000 - 50000);
    expect(r.annual_value_low_cents).toBe(r.monthly_value_low_cents * 12);
    expect(r.implementation_cost_cents).toBe(500000);
  });

  it("returns ranges: best-case payback uses high value, worst-case uses low value", () => {
    const r = calculateRoi(ROI_ASSUMPTIONS);
    expect(r.payback_months_low).toBeCloseTo(500000 / r.monthly_value_high_cents, 2);
    expect(r.payback_months_high).toBeCloseTo(500000 / r.monthly_value_low_cents, 2);
    expect(r.payback_months_low!).toBeLessThan(r.payback_months_high!);
    expect(r.roi_low!).toBeLessThan(r.roi_high!);
    expect(r.roi_low).toBeCloseTo((r.monthly_value_low_cents * 12 - 500000) / 500000, 2);
  });

  it("never reports payback when the estimate does not create value", () => {
    const r = calculateRoi({ ...ROI_ASSUMPTIONS, platform_cost_monthly_cents: 10_000_000 });
    expect(r.monthly_value_low_cents).toBeLessThan(0);
    expect(r.payback_months_high).toBeNull();
  });

  it("validates low <= high and non-negative money", () => {
    expect(() => calculateRoi({ ...ROI_ASSUMPTIONS, capacity_recovered_pct_low: 80 })).toThrow(/low must be <= high/);
    expect(() => calculateRoi({ ...ROI_ASSUMPTIONS, leakage_monthly_cents: -1 })).toThrow();
    expect(() => calculateRoi({ ...ROI_ASSUMPTIONS, loaded_hourly_cost_cents: 12.5 })).toThrow();
  });

  it("handles zero implementation cost without dividing by zero", () => {
    const r = calculateRoi({ ...ROI_ASSUMPTIONS, rh_implementation_fee_cents: 0, client_setup_cost_cents: 0 });
    expect(r.roi_low).toBeNull();
    expect(r.payback_months_low).toBe(0);
  });
});
