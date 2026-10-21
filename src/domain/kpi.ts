export interface KpiRow {
  id: string;
  metric_key: string;
  unit: string;
  measurement_type: "BASELINE" | "TARGET" | "RESULT";
  value: number;
  window_start: string | null;
  window_end: string | null;
  benefit_monthly_cents: number | null;
  notes: string | null;
  created_at: Date;
}

export interface KpiComparison {
  metric_key: string;
  unit: string;
  baseline: KpiRow | null;
  target: KpiRow | null;
  latestResult: KpiRow | null;
  results: KpiRow[];
  delta: number | null; // latest result - baseline
  deltaPct: number | null; // delta / |baseline|
}

const latest = (rows: KpiRow[]) =>
  [...rows].sort((a, b) => (a.window_end ?? "").localeCompare(b.window_end ?? "") || +new Date(a.created_at) - +new Date(b.created_at)).at(-1) ?? null;

/** Before/after comparison per metric: latest baseline, latest target, latest result (by measurement window). */
export function compareKpis(rows: KpiRow[]): KpiComparison[] {
  const byMetric = new Map<string, KpiRow[]>();
  for (const r of rows) byMetric.set(r.metric_key, [...(byMetric.get(r.metric_key) ?? []), r]);
  return [...byMetric.entries()].map(([metric_key, list]) => {
    const baseline = latest(list.filter((r) => r.measurement_type === "BASELINE"));
    const target = latest(list.filter((r) => r.measurement_type === "TARGET"));
    const results = list.filter((r) => r.measurement_type === "RESULT");
    const latestResult = latest(results);
    const delta = baseline && latestResult ? Number(latestResult.value) - Number(baseline.value) : null;
    const deltaPct = delta !== null && baseline && Number(baseline.value) !== 0 ? delta / Math.abs(Number(baseline.value)) : null;
    return { metric_key, unit: (latestResult ?? baseline ?? target ?? list[0]).unit, baseline, target, latestResult, results, delta, deltaPct };
  });
}
