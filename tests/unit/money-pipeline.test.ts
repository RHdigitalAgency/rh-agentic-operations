import { describe, expect, it } from "vitest";
import { deliveryCostCents, formatCents, grossMargin, normalizeCurrency, parseMoneyToCents } from "@/domain/money";
import { allowedTargets, checkTransition, type TransitionFacts } from "@/domain/pipeline";
import { compareKpis } from "@/domain/kpi";
import { median } from "@/domain/analytics";

describe("money helpers", () => {
  it("parses money to integer cents without float drift", () => {
    expect(parseMoneyToCents("1,250.50")).toBe(125050);
    expect(parseMoneyToCents("0.1")).toBe(10);
    expect(parseMoneyToCents("19.99")).toBe(1999);
    expect(parseMoneyToCents("$2,500")).toBe(250000);
    expect(parseMoneyToCents("")).toBeNull();
    expect(() => parseMoneyToCents("12.345")).toThrow();
    expect(() => parseMoneyToCents("abc")).toThrow();
  });
  it("formats and validates currency", () => {
    expect(formatCents(125050, "USD")).toBe("$1,250.50");
    expect(formatCents(250000, "USD")).toBe("$2,500");
    expect(normalizeCurrency("pen")).toBe("PEN");
    expect(() => normalizeCurrency("US")).toThrow();
  });
  it("computes gross margin from revenue and delivery cost inputs", () => {
    const cost = deliveryCostCents(40, 4000, 50000); // 40h * $40 + $500 = $2,100
    expect(cost).toBe(210000);
    expect(grossMargin(500000, cost)).toBeCloseTo(0.58, 5);
    expect(grossMargin(0, cost)).toBeNull();
  });
});

const facts = (o: Partial<TransitionFacts> = {}): TransitionFacts => ({
  hasOwner: true, hasNextAction: true, hasScheduledFitCall: false, hasQualifiedFitCall: false, hasAuditOffer: false, hasPaidAudit: false,
  auditInProgressOrLater: false, auditPresented: false, hasSentProposal: false, hasAcceptedImplementationProposal: false,
  hasAcceptedRetainer: false, lossReason: null, nurtureAt: null, ...o,
});
const rep = { isManager: false };

describe("pipeline stage transitions", () => {
  it("allows only the next stage forward (fixed pipeline keeps conversion comparable)", () => {
    expect(checkTransition("NEW_LEAD", "CONTACTED", facts(), rep).ok).toBe(true);
    expect(checkTransition("NEW_LEAD", "AUDIT_PAID", facts({ hasPaidAudit: true }), rep).ok).toBe(false);
  });
  it("requires owner and next action to leave New Lead", () => {
    expect(checkTransition("NEW_LEAD", "CONTACTED", facts({ hasOwner: false }), rep)).toMatchObject({ ok: false });
    expect(checkTransition("NEW_LEAD", "CONTACTED", facts({ hasNextAction: false }), rep)).toMatchObject({ ok: false });
  });
  it("gates stages on their exit conditions", () => {
    expect(checkTransition("AUDIT_OFFERED", "AUDIT_PAID", facts(), rep).ok).toBe(false);
    expect(checkTransition("AUDIT_OFFERED", "AUDIT_PAID", facts({ hasPaidAudit: true }), rep).ok).toBe(true);
    expect(checkTransition("FIT_CALL_BOOKED", "FIT_QUALIFIED", facts(), rep).ok).toBe(false);
    expect(checkTransition("PROPOSAL_SENT", "WON_DEPLOYMENT", facts(), rep).ok).toBe(false);
    expect(checkTransition("PROPOSAL_SENT", "WON_DEPLOYMENT", facts({ hasAcceptedImplementationProposal: true }), rep).ok).toBe(true);
    expect(checkTransition("PROPOSAL_SENT", "WON_RETAINER", facts({ hasAcceptedRetainer: true }), rep).ok).toBe(true);
  });
  it("requires a loss reason or nurture date for Lost / Nurture", () => {
    expect(checkTransition("CONTACTED", "LOST_NURTURE", facts(), rep)).toMatchObject({ ok: false });
    expect(checkTransition("CONTACTED", "LOST_NURTURE", facts({ lossReason: "NO_BUDGET" }), rep).ok).toBe(true);
    expect(checkTransition("CONTACTED", "LOST_NURTURE", facts({ nurtureAt: new Date() }), rep).ok).toBe(true);
  });
  it("only managers may move backwards, and closed won deals cannot be lost", () => {
    expect(checkTransition("AUDIT_PAID", "CONTACTED", facts(), rep).ok).toBe(false);
    expect(checkTransition("AUDIT_PAID", "CONTACTED", facts(), { isManager: true }).ok).toBe(true);
    expect(allowedTargets("WON_DEPLOYMENT", rep)).toEqual(["WON_RETAINER"]);
    expect(allowedTargets("LOST_NURTURE", rep)).toContain("NEW_LEAD");
  });
});

describe("KPI comparison and stats", () => {
  it("compares latest baseline vs latest result per metric", () => {
    const k = (type: "BASELINE" | "TARGET" | "RESULT", value: number, end: string | null, benefit: number | null = null) => ({
      id: `${type}-${end}`, metric_key: "response_minutes", unit: "minutes", measurement_type: type, value, window_start: end, window_end: end,
      benefit_monthly_cents: benefit, notes: null, created_at: new Date(),
    });
    const [c] = compareKpis([k("BASELINE", 240, "2026-07-31"), k("TARGET", 15, null), k("RESULT", 30, "2026-09-30"), k("RESULT", 12, "2026-10-15", 150000)]);
    expect(c.baseline?.value).toBe(240);
    expect(c.latestResult?.value).toBe(12);
    expect(c.delta).toBe(-228);
    expect(c.deltaPct).toBeCloseTo(-0.95, 2);
  });
  it("median", () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});
