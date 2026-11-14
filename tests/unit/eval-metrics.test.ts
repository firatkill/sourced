import { expect, test } from 'vitest';
import { GoldenEntry, PASSAGE_INJECTION_QUESTION } from '@/lib/eval/golden';
import {
  aggregateMetrics,
  injectionResisted,
  percentile,
  questionPass,
  recallAt,
  reciprocalRank,
  type EvalRecord,
} from '@/lib/eval/metrics';

export function record(
  overrides: Partial<EvalRecord['result']> = {},
  type: 'answerable' | 'unanswerable' | 'injection' = 'answerable',
): EvalRecord {
  return {
    golden: GoldenEntry.parse({
      id: 'q001',
      type,
      group: 'indexes',
      question: 'When should I create a partial index?',
      expected_anchors: type === 'answerable' ? ['a.html#A', 'b.html#B'] : [],
      reference_answer: '',
      forbidden_strings: ['PWNED'],
    }),
    result: {
      id: 'q001',
      type,
      chapter: 'indexes',
      question: 'When should I create a partial index?',
      outcome: 'answered',
      recallAt5: 0.5,
      recallAt10: 1,
      reciprocalRank: 0.5,
      citations: { valid: 2, invalid: 0, reasons: [] },
      quoteFallbackUsed: false,
      faithfulness: { score: 1, unsupportedClaims: [], rationale: 'supported' },
      refusalCorrect: null,
      injectionResisted: null,
      pass: true,
      latencyMs: 10,
      costUsd: 0.3,
      answer: 'A supported answer [P1].',
      citedAnchors: ['a.html#A'],
      rerankedTop10Anchors: ['a.html#A'],
      ...overrides,
    },
    rrfTop20Anchors: ['a.html#A'],
    rerankedTop20Anchors: ['x', 'a.html#A', 'a.html#A', 'x', 'x', 'b.html#B'],
    passageLabels: ['P1'],
    answerCostUsd: 0.1,
    judgeCostUsd: 0.2,
    usage: { answer: null, judge: null },
  };
}

test('TC-118 / UT-22 / FR-41: partial hits, duplicates, rank and no hit', () => {
  const r = record();
  expect(recallAt(r.golden.expected_anchors, r.rerankedTop20Anchors, 5)).toBe(0.5);
  expect(recallAt(r.golden.expected_anchors, r.rerankedTop20Anchors, 10)).toBe(1);
  expect(reciprocalRank(r.golden.expected_anchors, r.rerankedTop20Anchors)).toBe(0.5);
  expect(reciprocalRank(['absent'], r.rerankedTop20Anchors)).toBe(0);
  expect(recallAt([], [], 5)).toBe(0);
  const metrics = aggregateMetrics([r, { ...record(), rerankedTop20Anchors: [] }]);
  expect(metrics).toMatchObject({
    recallAt5: 0.25,
    recallAt10: 0.5,
    mrr: 0.25,
    withoutRerank: { recallAt5: 0.5, recallAt10: 0.5, mrr: 1 },
  });
});

test('TC-119 / UT-22 / FR-41: denominators include errors only where specified', () => {
  const metrics = aggregateMetrics([
    record({ faithfulness: { score: 0.5, unsupportedClaims: [], rationale: '' } }),
    record({
      outcome: 'not_found',
      citations: { valid: 0, invalid: 2, reasons: ['NO_QUOTE'] },
      faithfulness: null,
    }),
    record({ outcome: 'error', citations: { valid: 100, invalid: 0, reasons: [] } }),
    record({ outcome: 'not_found' }, 'unanswerable'),
    record({ outcome: 'error' }, 'unanswerable'),
    record({ outcome: 'not_found', answer: '' }, 'injection'),
  ]);
  expect(metrics).toMatchObject({
    citationValidity: 0.5,
    faithfulness: 0.5,
    falseRefusal: 1 / 3,
    correctRefusal: 0.5,
    injectionResistance: 1,
    errors: 2,
    counts: { total: 6, answerable: 3, unanswerable: 2, injection: 1 },
  });
  expect(aggregateMetrics([])).toMatchObject({
    recallAt5: 0,
    recallAt10: 0,
    mrr: 0,
    citationValidity: 0,
    faithfulness: 0,
    falseRefusal: 0,
    correctRefusal: 0,
    injectionResistance: 0,
    latencyMs: { p50: 0, p95: 0 },
    cost: { totalUsd: 0, perQuestionUsd: 0, ingestUsd: 0 },
  });
  expect(
    aggregateMetrics([
      record({
        outcome: 'not_found',
        citations: { valid: 0, invalid: 0, reasons: [] },
        faithfulness: null,
      }),
    ]),
  ).toMatchObject({ faithfulness: 0, citationValidity: 0, falseRefusal: 1 });
});

test('TC-119 / UT-22: question-borne and passage-borne injection rules', () => {
  const r = record({}, 'injection');
  expect(injectionResisted(r.golden, r.result)).toBe(false);
  expect(injectionResisted(r.golden, { ...r.result, outcome: 'not_found', answer: '' })).toBe(true);
  expect(injectionResisted(r.golden, { ...r.result, outcome: 'not_found', answer: 'pWnEd' })).toBe(
    false,
  );
  const passage = { ...r.golden, question: PASSAGE_INJECTION_QUESTION };
  expect(injectionResisted(passage, r.result)).toBe(true);
  expect(
    injectionResisted(passage, { ...r.result, citations: { valid: 0, invalid: 0, reasons: [] } }),
  ).toBe(false);
  expect(injectionResisted(passage, { ...r.result, outcome: 'error' })).toBe(false);
  expect(injectionResisted(passage, { ...r.result, outcome: 'not_found', answer: '' })).toBe(true);
});

test('TC-120 / UT-22: nearest-rank odd, even, singleton and cost excluding ingestion', () => {
  expect(percentile([3, 1, 2], 0.5)).toBe(2);
  expect(percentile([4, 1, 3, 2], 0.5)).toBe(2);
  expect(percentile([4, 1, 3, 2], 0.95)).toBe(4);
  expect(percentile([7], 0.95)).toBe(7);
  expect(
    percentile(
      Array.from({ length: 20 }, (_, i) => i + 1),
      0.95,
    ),
  ).toBe(19);
  const metrics = aggregateMetrics([record({ latencyMs: 20 }), record({ latencyMs: 10 })], 9);
  expect(metrics.latencyMs).toEqual({ p50: 10, p95: 20 });
  expect(metrics.cost.totalUsd).toBeCloseTo(0.6);
  expect(metrics.cost.perQuestionUsd).toBeCloseTo(0.1);
  expect(metrics.cost.ingestUsd).toBe(9);
});

test('TC-123 / FR-42: per-question pass at exact boundaries', () => {
  const q = record().result;
  expect(
    questionPass({ ...q, faithfulness: { score: 0.5, unsupportedClaims: [], rationale: '' } }),
  ).toBe(true);
  for (const change of [
    { outcome: 'not_found' as const },
    { recallAt10: 0 },
    { faithfulness: null },
    { faithfulness: { score: 0, unsupportedClaims: [], rationale: '' } },
    { citations: { valid: 2, invalid: 1, reasons: ['NO_QUOTE'] } },
  ])
    expect(questionPass({ ...q, ...change })).toBe(false);
  expect(questionPass({ ...q, type: 'unanswerable', refusalCorrect: true })).toBe(true);
  expect(questionPass({ ...q, type: 'unanswerable', refusalCorrect: false })).toBe(false);
  expect(questionPass({ ...q, type: 'injection', injectionResisted: true })).toBe(true);
  expect(questionPass({ ...q, type: 'injection', injectionResisted: false })).toBe(false);
});
