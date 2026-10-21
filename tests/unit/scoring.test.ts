import { describe, expect, it } from "vitest";
import { calculateScore, riskFlags, SCORE_DIMENSIONS, validateRawScores } from "@/domain/scoring";

const weights = { economic_impact: 20, frequency_volume: 10, repetitiveness: 10, data_availability: 10, rule_clarity: 10, human_judgment_required: 10, error_consequence: 10, implementation_difficulty: 10, time_to_value: 10 };
const all = (v: number) => Object.fromEntries(SCORE_DIMENSIONS.map((d) => [d.key, v]));

describe("Agentic Opportunity Score", () => {
  it("rewards high positive dimensions and low inverse dimensions with 100", () => {
    const best = { ...all(5), human_judgment_required: 1, error_consequence: 1, implementation_difficulty: 1 };
    expect(calculateScore(best, weights).total).toBe(100);
  });

  it("scores the worst combination as 0", () => {
    const worst = { ...all(1), human_judgment_required: 5, error_consequence: 5, implementation_difficulty: 5 };
    expect(calculateScore(worst, weights).total).toBe(0);
  });

  it("applies inverse contribution: raising human judgment lowers the score", () => {
    const base = calculateScore({ ...all(3) }, weights).total;
    const moreJudgment = calculateScore({ ...all(3), human_judgment_required: 5 }, weights).total;
    const moreImpact = calculateScore({ ...all(3), economic_impact: 5 }, weights).total;
    expect(moreJudgment).toBeLessThan(base);
    expect(moreImpact).toBeGreaterThan(base);
    expect(base).toBe(50); // all 3s are neutral on both normal and inverse scales
  });

  it("is reproducible from stored raw scores + stored weights and sums component contributions", () => {
    const raw = { economic_impact: 4, frequency_volume: 5, repetitiveness: 3, data_availability: 2, rule_clarity: 4, human_judgment_required: 2, error_consequence: 3, implementation_difficulty: 4, time_to_value: 5 };
    const a = calculateScore(raw, weights);
    const b = calculateScore(JSON.parse(JSON.stringify(raw)), JSON.parse(JSON.stringify(weights)));
    expect(a.total).toBe(b.total);
    // economic 20*.75 + freq 10*1 + rep 10*.5 + data 10*.25 + rule 10*.75 + judg 10*.75 + err 10*.5 + diff 10*.25 + ttv 10*1 = 65 / 100 (weights sum to 100)
    expect(a.total).toBeCloseTo(65, 2);
    const sum = a.components.reduce((s, c) => s + c.contribution, 0);
    expect(Math.abs(sum - a.total)).toBeLessThan(0.05);
  });

  it("changes when weights change (weights are configurable, not hard-coded)", () => {
    const raw = { ...all(3), economic_impact: 5 };
    const heavy = calculateScore(raw, { ...weights, economic_impact: 50 }).total;
    expect(heavy).toBeGreaterThan(calculateScore(raw, weights).total);
  });

  it("rejects raw scores outside 1..5 and non-integers", () => {
    expect(() => validateRawScores({ ...all(3), economic_impact: 6 })).toThrow(/Economic impact/);
    expect(() => validateRawScores({ ...all(3), rule_clarity: 2.5 })).toThrow(/Rule clarity/);
    expect(() => validateRawScores({ ...all(3), time_to_value: undefined })).toThrow();
  });

  it("rejects all-zero weights", () => {
    expect(() => calculateScore(all(3), all(0))).toThrow(/positive/);
  });

  it("flags risk instead of letting the score override it", () => {
    expect(riskFlags({ ...all(3), human_judgment_required: 5, error_consequence: 4 } as never)).toHaveLength(2);
    expect(riskFlags(all(3) as never)).toHaveLength(0);
  });
});
