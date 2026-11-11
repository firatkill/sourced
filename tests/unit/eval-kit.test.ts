import { readFile } from 'node:fs/promises';
import { expect, test, vi } from 'vitest';
import { GoldenEntry, parseGolden } from '@/lib/eval/golden';
import { validateGoldenProfile } from '@/lib/eval/validate';
import { compareResults, renderComparison } from '@/lib/eval/compare';
import { EvalResult } from '@/lib/eval/results-schema';
import { EvalThresholds } from '@/lib/eval/markdown';

vi.mock('node:fs/promises', async (original) => ({
  ...(await original<typeof import('node:fs/promises')>()),
}));

const corpus = { headings: [], identifiers: [] };

test('TC-226 / FR-84: kit profile requires 20 answerable, 3 unanswerable and built-in injections', async () => {
  const injections = parseGolden(
    await readFile('eval/shared/injection.jsonl', 'utf8'),
    true,
  ).entries;
  const entries = Array.from({ length: 23 }, (_, index) =>
    GoldenEntry.parse({
      id: `q${String(index + 10).padStart(3, '0')}`,
      type: index < 20 ? 'answerable' : 'unanswerable',
      group: 'custom',
      question: 'How does the configured source work here?',
      expected_anchors: index < 20 ? ['manual.md#section'] : [],
      reference_answer: '',
    }),
  );
  expect(validateGoldenProfile([...entries, ...injections], corpus, 'kit', injections)).toEqual([]);
  expect(validateGoldenProfile(entries.slice(1), corpus, 'kit', injections)).toContain(
    'answerable: need at least 20.',
  );
  expect(validateGoldenProfile(entries.slice(0, 22), corpus, 'kit', injections)).toContain(
    'unanswerable: need at least 3.',
  );
  expect(
    validateGoldenProfile(entries, corpus, 'kit', injections).filter((error) =>
      error.startsWith('Missing built-in injection'),
    ),
  ).toHaveLength(4);
  expect(validateGoldenProfile([...entries, entries[0]!], corpus, 'kit', injections)).toContain(
    'Golden ids must be unique.',
  );
});

test('TC-226 / FR-85: fixture comparison reports deltas, changed questions and strict regression limits', async () => {
  const baseline = EvalResult.parse(
    JSON.parse(await readFile('tests/fixtures/eval-results/2026-11-01.json', 'utf8')),
  );
  const current = structuredClone(baseline);
  const thresholds = EvalThresholds.parse(baseline.thresholds);
  current.metrics.recallAt5 =
    baseline.metrics.recallAt5 - thresholds.maxRegression.recallAt5 - 0.01;
  current.questions[0]!.pass = !baseline.questions[0]!.pass;
  const comparison = compareResults(current, baseline, thresholds);
  expect(comparison.regressions).toContainEqual(expect.objectContaining({ metric: 'recallAt5' }));
  expect(comparison.changedQuestions).toEqual([current.questions[0]!.id]);
  expect(comparison.deltas.recallAt5).toBeCloseTo(-thresholds.maxRegression.recallAt5 - 0.01);
  expect(renderComparison(comparison)).toContain('| Metric | Delta |');
  expect(renderComparison(comparison)).toContain(`Changed questions: ${current.questions[0]!.id}`);
  current.metrics.recallAt5 = baseline.metrics.recallAt5 - thresholds.maxRegression.recallAt5;
  expect(compareResults(current, baseline, thresholds).regressions).toEqual([]);
});

test('TC-226 / D-126: built-ins merge only in memory, preserve accepted IDs and reject reserved IDs in golden files', async () => {
  const { loadGoldenSet } = await import('@/lib/eval/validate');
  const text = await readFile('eval/postgres-17/golden.jsonl', 'utf8');
  const example = await loadGoldenSet(text, 'example');
  const kit = await loadGoldenSet(text, 'kit');
  expect(example.errors).toEqual([]);
  expect(example.entries).toHaveLength(40);
  expect(kit.errors).toEqual([]);
  expect(kit.entries.slice(0, 40)).toEqual(example.entries);
  expect(kit.entries.slice(40).map((entry) => entry.id)).toEqual([
    'shared-inj-01',
    'shared-inj-02',
    'shared-inj-03',
    'shared-inj-04',
  ]);
  expect(await readFile('eval/postgres-17/golden.jsonl', 'utf8')).toBe(text);
  const shared = await readFile('eval/shared/injection.jsonl', 'utf8');
  expect(parseGolden(shared).errors).toHaveLength(4);
  expect(parseGolden(shared, true).errors).toEqual([]);
  expect(
    parseGolden(
      JSON.stringify({ ...kit.entries[40], type: 'answerable', expected_anchors: ['manual.md#x'] }),
      true,
    ).errors.length,
  ).toBeGreaterThan(0);
});

test.each([
  ['recallAt5', ['tiny_chunks'], 'chunking'],
  ['recallAt10', ['oversized_chunks'], 'chunking'],
  ['recallAt5', ['language_mismatch'], 'language'],
  ['citationValidity', [], 'quote fallback rate and model'],
  ['correctRefusal', [], 'not-found sentence or model'],
  ['recallAt5', [], null],
  ['mrr', [], null],
  ['faithfulness', [], null],
  ['injectionResistance', [], null],
] as const)(
  'TC-226 / FR-84 / D-126: likely cause for %s with %j',
  async (metric, codes, expected) => {
    const { likelyCause } = await import('@/lib/eval/compare');
    expect(
      likelyCause(
        metric,
        codes.map((code) => ({ code })),
      ),
    ).toBe(expected);
  },
);

test('TC-226 / FR-84: injection scope reports question-borne only without a fixture', async () => {
  const { injectionScope } = await import('@/lib/eval/compare');
  expect(injectionScope(false)).toBe('question-borne only');
  expect(injectionScope(true)).toBe('question-borne and passage-borne');
});

test('TC-226 / FR-84: corpus thresholds override defaults; malformed overrides do not fall back', async () => {
  const fs = await import('node:fs/promises');
  const { loadThresholds } = await import('@/lib/eval/compare');
  const defaults = JSON.parse(await fs.readFile('eval/thresholds.json', 'utf8')) as unknown;
  const thresholds = EvalThresholds.parse(defaults);
  thresholds.floors.recallAt5 = 0.91;
  const original = fs.readFile;
  const spy = vi
    .spyOn(fs, 'readFile')
    .mockImplementation((...args) =>
      args[0] === 'eval/custom/thresholds.json'
        ? Promise.resolve(JSON.stringify(thresholds))
        : original(...args),
    );
  try {
    expect(await loadThresholds('custom')).toEqual(thresholds);
    expect(await loadThresholds('absent-t67-corpus')).toEqual(defaults);
    spy.mockResolvedValueOnce('{}');
    await expect(loadThresholds('custom')).rejects.toThrow();
  } finally {
    spy.mockRestore();
  }
});
