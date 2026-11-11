import type { EvalResult, Metrics } from './results-schema';
import { metricValues, type EvalThresholds } from './markdown';

/** Aggregate gates from TRD §17.5; equality at a limit passes. */
export function checkRun(
  metrics: Metrics,
  thresholds: EvalThresholds,
  baseline: Metrics | null,
): Pick<EvalResult, 'pass' | 'failures'> {
  const values = metricValues(metrics);
  const prior = baseline ? metricValues(baseline) : null;
  const failures: EvalResult['failures'] = [];
  for (const [kind, limits] of [
    ['floor', thresholds.floors],
    ['ceiling', thresholds.ceilings],
    ['regression', thresholds.maxRegression],
  ] as const) {
    if (kind === 'regression' && !prior) continue;
    for (const [metric, threshold] of Object.entries(limits)) {
      const value = values[metric];
      const limit = kind === 'regression' ? (prior?.[metric] ?? 0) - threshold : threshold;
      if (value != null && (kind === 'ceiling' ? value > limit : value < limit))
        failures.push({ metric, kind, value, limit });
    }
  }
  return { pass: failures.length === 0, failures };
}
