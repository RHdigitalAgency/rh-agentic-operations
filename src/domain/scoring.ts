import { ValidationError } from "@/lib/errors";

/** Agentic Opportunity Score dimensions (PDR §8). Inverse dimensions: a higher raw score lowers the total. */
export const SCORE_DIMENSIONS = [
  { key: "economic_impact", label: "Economic impact", inverse: false },
  { key: "frequency_volume", label: "Frequency / volume", inverse: false },
  { key: "repetitiveness", label: "Repetitiveness", inverse: false },
  { key: "data_availability", label: "Data availability", inverse: false },
  { key: "rule_clarity", label: "Rule clarity", inverse: false },
  { key: "human_judgment_required", label: "Human judgment required", inverse: true },
  { key: "error_consequence", label: "Error consequence", inverse: true },
  { key: "implementation_difficulty", label: "Implementation difficulty", inverse: true },
  { key: "time_to_value", label: "Time-to-value (faster = higher)", inverse: false },
] as const;

export type DimensionKey = (typeof SCORE_DIMENSIONS)[number]["key"];
export type RawScores = Record<DimensionKey, number>;
export type Weights = Record<DimensionKey, number>;

export interface ScoreComponent {
  key: DimensionKey;
  raw: number;
  inverse: boolean;
  normalized: number; // 0..1 after inversion
  weight: number;
  contribution: number; // points out of 100
}

export interface ScoreResult {
  total: number; // 0..100, 2 decimals
  components: ScoreComponent[];
  weightSum: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function validateRawScores(raw: object): RawScores {
  const out = {} as RawScores;
  for (const d of SCORE_DIMENSIONS) {
    const v = Number((raw as Record<string, unknown>)[d.key]);
    if (!Number.isInteger(v) || v < 1 || v > 5) throw new ValidationError(`${d.label} must be an integer from 1 to 5`);
    out[d.key] = v;
  }
  return out;
}

export function validateWeights(w: object): Weights {
  const out = {} as Weights;
  let sum = 0;
  for (const d of SCORE_DIMENSIONS) {
    const v = Number((w as Record<string, unknown>)[d.key]);
    if (!Number.isFinite(v) || v < 0) throw new ValidationError(`Weight for ${d.label} must be a non-negative number`);
    out[d.key] = v;
    sum += v;
  }
  if (sum <= 0) throw new ValidationError("At least one weight must be positive");
  return out;
}

/**
 * Score = 100 * sum(w_d * n_d) / sum(w_d), where n_d = (raw-1)/4 for normal and (5-raw)/4 for inverse dimensions.
 * Deterministic and reproducible from the stored raw scores + stored weights.
 */
export function calculateScore(rawInput: object, weightsInput: object): ScoreResult {
  const raw = validateRawScores(rawInput);
  const weights = validateWeights(weightsInput);
  const weightSum = SCORE_DIMENSIONS.reduce((s, d) => s + weights[d.key], 0);
  const components = SCORE_DIMENSIONS.map((d) => {
    const normalized = d.inverse ? (5 - raw[d.key]) / 4 : (raw[d.key] - 1) / 4;
    return {
      key: d.key,
      raw: raw[d.key],
      inverse: d.inverse,
      normalized,
      weight: weights[d.key],
      contribution: round2((100 * weights[d.key] * normalized) / weightSum),
    };
  });
  const total = round2((100 * SCORE_DIMENSIONS.reduce((s, d, i) => s + weights[d.key] * components[i].normalized, 0)) / weightSum);
  return { total, components, weightSum };
}

/**
 * The score ranks opportunities; it never overrides risk (Strategic Plan §6).
 * High judgment or high error consequence keeps the process human-controlled or approval-gated.
 */
export function riskFlags(raw: RawScores): string[] {
  const flags: string[] = [];
  if (raw.human_judgment_required >= 4) flags.push("High human judgment: keep human-controlled or approval-gated");
  if (raw.error_consequence >= 4) flags.push("High error consequence: require approval gates and strong controls");
  return flags;
}
