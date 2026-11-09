import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import { checkRun } from '@/lib/eval/thresholds';
import type { Metrics } from '@/lib/eval/results-schema';
import thresholds from '../../eval/thresholds.json';

const passing = (): Metrics => ({
  ...thresholds.floors,
  falseRefusal: 0.1,
  latencyMs: { p50: 100, p95: 15000 },
  cost: { totalUsd: 0.8, perQuestionUsd: 0.02, ingestUsd: 0.1 },
  errors: 0,
  withoutRerank: { recallAt5: 0, recallAt10: 0, mrr: 0 },
  counts: { total: 40, answerable: 28, unanswerable: 7, injection: 5 },
});

test('TC-127 / UT-23: exact floors and ceilings pass without a baseline', () => {
  expect(checkRun(passing(), thresholds, null)).toEqual({ pass: true, failures: [] });
});

test.each(Object.entries(thresholds.floors))(
  'TC-127 / UT-23: %s below its floor fails with value and limit',
  (metric, limit) => {
    const value = limit - 0.001;
    expect(checkRun({ ...passing(), [metric]: value }, thresholds, null)).toEqual({
      pass: false,
      failures: [{ metric, kind: 'floor', value, limit }],
    });
  },
);

test.each([
  [
    'falseRefusal',
    0.1,
    (m: Metrics, v: number) => {
      m.falseRefusal = v;
    },
  ],
  [
    'latencyP95Ms',
    15000,
    (m: Metrics, v: number) => {
      m.latencyMs.p95 = v;
    },
  ],
  [
    'costPerQuestionUsd',
    0.02,
    (m: Metrics, v: number) => {
      m.cost.perQuestionUsd = v;
    },
  ],
  [
    'errors',
    0,
    (m: Metrics, v: number) => {
      m.errors = v;
    },
  ],
] as const)('TC-127 / UT-23: %s above its ceiling fails', (metric, limit, set) => {
  const metrics = passing();
  const value = limit + 1;
  set(metrics, value);
  expect(checkRun(metrics, thresholds, null)).toEqual({
    pass: false,
    failures: [{ metric, kind: 'ceiling', value, limit }],
  });
});

test.each(Object.entries(thresholds.maxRegression))(
  'TC-127 / UT-23: %s regression equality passes, a larger drop fails',
  (metric, delta) => {
    const baseline = { ...passing(), [metric]: 1 };
    const limit = 1 - delta;
    expect(checkRun({ ...passing(), [metric]: limit }, thresholds, baseline)).toEqual({
      pass: true,
      failures: [],
    });
    const value = limit - 0.001;
    const verdict = checkRun({ ...passing(), [metric]: value }, thresholds, baseline);
    expect(verdict.pass).toBe(false);
    expect(verdict.failures).toContainEqual({ metric, kind: 'regression', value, limit });
    expect(checkRun({ ...passing(), [metric]: 1 }, thresholds, baseline).pass).toBe(true);
  },
);

test('TC-127 / UT-23: accumulates failures; latency is a ceiling only', () => {
  const metrics = passing();
  metrics.recallAt5 = 0;
  metrics.errors = 1;
  const baseline = passing();
  baseline.latencyMs.p95 = 1;
  expect(checkRun(passing(), thresholds, baseline)).toEqual({ pass: true, failures: [] });
  expect(checkRun(metrics, thresholds, baseline).failures).toEqual([
    { metric: 'recallAt5', kind: 'floor', value: 0, limit: 0.7 },
    { metric: 'errors', kind: 'ceiling', value: 1, limit: 0 },
    { metric: 'recallAt5', kind: 'regression', value: 0, limit: 0.7 - 0.05 },
  ]);
});

test('TC-129 / D-17: workflow is identical to normative TRD §25.2', async () => {
  const trd = await readFile('docs/TRD.md', 'utf8');
  const section = trd.split('### 25.2 ')[1];
  const normative = section?.split('```yaml\n')[1]?.split('```')[0];
  expect(normative).toBeDefined();
  expect(await readFile('.github/workflows/eval.yml', 'utf8')).toBe(normative);
});
