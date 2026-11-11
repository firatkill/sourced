import { mkdtemp, access, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { aggregateMetrics } from '@/lib/eval/metrics';
import { EvalResult } from '@/lib/eval/results-schema';
import {
  EvalThresholds,
  renderMarkdown,
  renderMetricsTable,
  resultFileStem,
} from '@/lib/eval/markdown';
import thresholds from '../../eval/thresholds.json';

const result = (): EvalResult =>
  EvalResult.parse({
    schemaVersion: 1,
    runId: '2026-11-09T12:00:00Z',
    date: '2026-11-09',
    gitSha: 'abc123',
    config: {
      chatModel: 'chat',
      judgeModel: 'judge',
      embeddingModel: 'embedding',
      promptVersion: 'version',
      corpusVersion: 'corpus',
      retrieval: {
        vectorCandidates: 40,
        ftsCandidates: 40,
        rrfK: 60,
        rerankCandidates: 20,
        finalPassages: 6,
      },
    },
    metrics: aggregateMetrics([]),
    thresholds,
    baseline: null,
    pass: false,
    failures: [{ metric: 'recallAt5', kind: 'floor', value: 0, limit: 0.7 }],
    questions: [
      {
        id: 'q001',
        type: 'answerable',
        chapter: 'indexes',
        question: 'Why use indexes?',
        outcome: 'not_found',
        recallAt5: 0,
        recallAt10: 0,
        reciprocalRank: 0,
        citations: { valid: 0, invalid: 1, reasons: ['NO_QUOTE'] },
        quoteFallbackUsed: false,
        faithfulness: null,
        refusalCorrect: null,
        injectionResisted: null,
        pass: false,
        latencyMs: 10,
        costUsd: 0.01,
        answer: '',
        citedAnchors: [],
        rerankedTop10Anchors: [],
      },
    ],
  });

test('TC-123 / FR-42: normative result schema and Markdown contents', () => {
  const r = result();
  expect(EvalResult.parse(JSON.parse(JSON.stringify(r)))).toEqual(r);
  expect(EvalResult.safeParse({ ...r, schemaVersion: 2 }).success).toBe(false);
  expect(EvalResult.safeParse({ ...r, date: 'yesterday' }).success).toBe(false);
  expect(
    EvalResult.safeParse({ ...r, questions: [{ ...r.questions[0], outcome: 'unknown' }] }).success,
  ).toBe(false);
  expect(EvalThresholds.safeParse({ ...thresholds, ceilings: {} }).success).toBe(false);
  const markdown = renderMarkdown(r);
  for (const text of [
    '2026-11-09',
    'abc123',
    'chat',
    'judge',
    'embedding',
    'No baseline',
    '| Metric | Value | Floor or ceiling | Baseline | Delta | Status |',
    '## Failures',
    '- recallAt5: floor',
    '| ID | Type | R@5 | RR | Faithfulness | Citations (valid / invalid) | Pass |',
    '| q001 | answerable | 0 | 0 | — | 0 / 1 | FAIL |',
  ])
    expect(markdown).toContain(text);
  const baseline = { ...r.metrics, recallAt5: 0.5 };
  expect(renderMetricsTable(r, baseline)).toContain(
    '| recallAt5 | 0 | ≥ 0.7 | 0.5 | -0.5 | FAIL |',
  );
  expect(
    renderMarkdown(
      { ...r, failures: [], baseline: { runId: 'prior', file: 'prior.json' } },
      baseline,
    ),
  ).toContain('Baseline: prior.json (prior)');
  expect(renderMarkdown({ ...r, failures: [] })).toContain('None.');
});

test('TC-123 / FR-42: deterministic date names reserve either extension, then -2 and -3', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sourced-eval-'));
  const now = () => new Date('2026-11-09T23:59:00Z');
  const exists = async (path: string) => {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  };
  try {
    const first = await resultFileStem(dir, now, exists);
    expect(first).toBe(`${dir}/2026-11-09`);
    await writeFile(`${first}.json`, JSON.stringify(result()));
    const second = await resultFileStem(dir, now, exists);
    expect(second).toBe(`${dir}/2026-11-09-2`);
    await writeFile(`${second}.md`, renderMarkdown(result()));
    expect(await resultFileStem(dir, now, exists)).toBe(`${dir}/2026-11-09-3`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('D-129: null costs remain unknown and the ceiling is not evaluated', async () => {
  const { checkRun } = await import('@/lib/eval/thresholds');
  const { compareResults } = await import('@/lib/eval/compare');
  const r = result();
  r.metrics.cost.totalUsd = null;
  r.metrics.cost.perQuestionUsd = null;
  r.questions[0]!.costUsd = null;
  expect(EvalResult.parse(r)).toEqual(r);
  expect(
    checkRun(r.metrics, thresholds, null).failures.some((f) => f.metric === 'costPerQuestionUsd'),
  ).toBe(false);
  expect(renderMetricsTable(r)).toContain(
    '| costPerQuestionUsd | unknown | ≤ 0.02 | — | — | Not evaluated |',
  );
  expect(compareResults(r, result(), thresholds).deltas).not.toHaveProperty('costPerQuestionUsd');
});
