import { describe, expect, it } from "vitest";
import { monthlyRevenue } from "@/domain/analytics";

describe("monthlyRevenue", () => {
  it("buckets paid audits and won implementation (net of credit) by month, skipping retainers, other currencies and cancelled audits", () => {
    const d = (s: string) => new Date(s);
    const rows = monthlyRevenue(
      {
        audits: [
          { id: "a1", opportunity_id: "o", status: "PAID", price_cents: 150000, currency: "USD", paid_at: d("2026-09-03T12:00:00Z"), presentation_at: null },
          { id: "a2", opportunity_id: "o", status: "CANCELLED", price_cents: 99900, currency: "USD", paid_at: d("2026-10-01T12:00:00Z"), presentation_at: null },
          { id: "a3", opportunity_id: "o", status: "PAID", price_cents: 50000, currency: "PEN", paid_at: d("2026-10-02T12:00:00Z"), presentation_at: null },
          { id: "a4", opportunity_id: "o", status: "PAID", price_cents: 150000, currency: "USD", paid_at: d("2025-01-02T12:00:00Z"), presentation_at: null },
        ],
        proposals: [
          { id: "p1", opportunity_id: "o", proposal_type: "PILOT", status: "ACCEPTED", amount_cents: 450000, audit_credit_cents: 150000, currency: "USD", decision_at: d("2026-10-10T12:00:00Z") },
          { id: "p2", opportunity_id: "o", proposal_type: "RETAINER", status: "ACCEPTED", amount_cents: 120000, currency: "USD", decision_at: d("2026-10-11T12:00:00Z") },
          { id: "p3", opportunity_id: "o", proposal_type: "DEPLOYMENT", status: "SENT", amount_cents: 900000, currency: "USD", decision_at: null },
        ],
      },
      { baseCurrency: "USD", months: 3, now: d("2026-10-21T12:00:00Z") },
    );
    expect(rows.map((r) => r.key)).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(rows.map((r) => [r.auditCents, r.implementationCents])).toEqual([[0, 0], [150000, 0], [0, 300000]]);
  });
});
