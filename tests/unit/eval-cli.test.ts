import { AppError } from '@/lib/errors';
import { checkCorpusSchema } from '@/lib/kit/vector-schema';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { afterEach, expect, test, vi } from 'vitest';
import { loadBaseline, runEval } from '../../scripts/eval';
import { aggregateMetrics } from '@/lib/eval/metrics';
import { EvalResult } from '@/lib/eval/results-schema';
import thresholds from '../../eval/thresholds.json';
import { resetEnvForTests } from '@/lib/env';
import { parseGolden, type GoldenCorpus } from '@/lib/eval/golden';

const state = vi.hoisted(() => ({
  fixtures: true,
  ingest: true,
  mismatch: false,
  calls: 0,
  writes: vi.fn(),
}));
vi.mock('@/lib/kit/load-config', async (original) => ({
  ...(await original<typeof import('@/lib/kit/load-config')>()),
  loadConfig: vi.fn(async () => {}),
}));
vi.mock('@/lib/kit/vector-schema', () => ({ checkCorpusSchema: vi.fn(async () => {}) }));
vi.mock('node:child_process', () => ({ execFileSync: vi.fn(() => '') }));
vi.mock('@/lib/db/client', () => ({
  closeSqlForTests: async () => {},
  getSql: () => async (parts: TemplateStringsArray) => {
    const query = parts.join('');
    if (query.includes('FROM documents')) return state.fixtures ? [{ exists: 1 }] : [];
    if (query.includes('FROM ingest_runs'))
      return state.ingest ? [{ corpus_version: 'test', cost_usd_estimate: '0.01' }] : [];
    if (query.includes('embedding_model')) return state.mismatch ? [{ exists: 1 }] : [];
    const { entries } = parseGolden(await readFile('eval/golden.jsonl', 'utf8'));
    return entries.flatMap((entry) => entry.expected_anchors.map((anchor) => ({ anchor })));
  },
}));
vi.mock('../../scripts/eval-validate', () => ({
  readGoldenCorpus: (): Promise<GoldenCorpus> => Promise.resolve({ headings: [], identifiers: [] }),
}));
vi.mock('@/lib/eval/golden', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/eval/golden')>()),
  validateGolden: () => [],
}));
vi.mock('node:fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs/promises')>()),
  writeFile: state.writes,
  appendFile: state.writes,
}));
vi.mock('@/lib/generation/answer', () => ({
  answerQuestion: () => {
    state.calls++;
    return Promise.reject(new Error('test failure'));
  },
}));

afterEach(() => {
  state.fixtures = true;
  state.ingest = true;
  state.mismatch = false;
  state.calls = 0;
  state.writes.mockClear();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.mocked(execFileSync).mockReset().mockReturnValue('');
  resetEnvForTests();
});

function logs() {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  return vi.spyOn(console, 'error').mockImplementation(() => {});
}
function live() {
  vi.stubEnv('LLM_MODE', 'live');
  vi.stubEnv('OPENAI_API_KEY', 'test-only-not-a-real-key');
  vi.stubEnv('CHAT_MODEL', 'test-chat');
  vi.stubEnv('JUDGE_MODEL', 'test-judge');
  for (const role of ['CHAT_INPUT', 'CHAT_OUTPUT', 'JUDGE_INPUT', 'JUDGE_OUTPUT', 'EMBED'])
    vi.stubEnv(`PRICE_${role}_PER_MTOK`, '1');
  resetEnvForTests();
}

test.each(['fixtures', 'ingest'] as const)(
  'TC-124: missing %s exits 2 with exact ingest message',
  async (key) => {
    const error = logs();
    state[key] = false;
    expect(await runEval(['--limit', '1', '--no-write'])).toBe(2);
    expect(error).toHaveBeenCalledWith('Run pnpm ingest --include-fixtures first');
    expect(state.calls).toBe(0);
    expect(state.writes).not.toHaveBeenCalled();
  },
);

test('TC-124: embedding mismatch exits 2 before calls', async () => {
  const error = logs();
  state.mismatch = true;
  expect(await runEval(['--limit', '1', '--no-write'])).toBe(2);
  expect(error).toHaveBeenCalledWith(
    'Re-run pnpm ingest --offline --include-fixtures in the current LLM_MODE',
  );
  expect(state.calls).toBe(0);
});

test('TC-121: projected budget exits 3 and writes no reports', async () => {
  logs();
  live();
  vi.stubEnv('EVAL_MAX_COST_USD', '0.000001');
  resetEnvForTests();
  expect(await runEval(['--limit', '1'])).toBe(3);
  expect(state.calls).toBe(0);
  expect(state.writes).not.toHaveBeenCalled();
});

test('TC-122: zero judge price exits 2 with normative message', async () => {
  const error = logs();
  live();
  vi.stubEnv('PRICE_JUDGE_INPUT_PER_MTOK', '0');
  resetEnvForTests();
  expect(await runEval(['--limit', '1'])).toBe(2);
  expect(error).toHaveBeenCalledWith(
    'Set PRICE_* variables; the budget guard cannot work with zero prices',
  );
  expect(state.calls).toBe(0);
  expect(state.writes).not.toHaveBeenCalled();
});

test('TC-125: --only with --limit selects questions and pipeline errors exit 1, never 2', async () => {
  logs();
  expect(await runEval(['--only', 'q001,q002,q003', '--limit', '2', '--no-write'])).toBe(1);
  expect(state.calls).toBe(2);
  expect(state.writes).not.toHaveBeenCalled();
  expect(console.log).toHaveBeenCalledWith(expect.stringContaining('| errors | 2 |'));
});

function baselineResult(runId: string): EvalResult {
  return EvalResult.parse({
    schemaVersion: 1,
    runId,
    date: '2026-11-09',
    gitSha: 'test',
    config: {
      chatModel: 'chat',
      judgeModel: 'judge',
      embeddingModel: 'embed',
      promptVersion: 'v1',
      corpusVersion: 'v1',
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
    failures: [],
    questions: [],
  });
}

test('TC-127: automatic baseline uses committed contents and greatest runId, excluding output', async () => {
  const older = baselineResult('2026-11-09T08:00:00Z');
  const newest = baselineResult('2026-11-09T10:00:00Z');
  vi.mocked(execFileSync).mockImplementation((_cmd, args) => {
    if (args?.[0] === 'ls-tree')
      return 'eval/results/2026-11-09-2.json\neval/results/2026-11-09-10.json\neval/results/output.json\neval/results/report.md\n';
    return JSON.stringify(args?.[1] === 'HEAD:eval/results/2026-11-09-10.json' ? newest : older);
  });
  expect(await loadBaseline(undefined, 'eval/results', './eval/results/output.json')).toEqual({
    file: 'eval/results/2026-11-09-10.json',
    result: newest,
  });
  expect(execFileSync).toHaveBeenCalledWith(
    'git',
    ['ls-tree', '-r', '--name-only', 'HEAD', '--', 'eval/results'],
    { encoding: 'utf8' },
  );
  expect(execFileSync).not.toHaveBeenCalledWith(
    'git',
    ['show', 'HEAD:eval/results/output.json'],
    expect.anything(),
  );
});

test('TC-127: explicit --baseline takes precedence and validates the results schema', async () => {
  const fs = await import('node:fs/promises');
  const result = baselineResult('2026-11-09T11:00:00Z');
  vi.spyOn(fs, 'readFile')
    .mockResolvedValueOnce(JSON.stringify(result))
    .mockResolvedValueOnce('{}');
  expect(await loadBaseline('chosen.json', 'eval/results', 'output.json')).toEqual({
    file: 'chosen.json',
    result,
  });
  expect(execFileSync).not.toHaveBeenCalled();
  await expect(loadBaseline('invalid.json', 'eval/results', 'output.json')).rejects.toThrow();
});

test('TC-127: no committed baseline skips regression and reports No baseline; failures exit 1', async () => {
  logs();
  expect(await loadBaseline(undefined, 'eval/results', 'output.json')).toBeNull();
  expect(await runEval(['--limit', '1', '--no-write'])).toBe(1);
  expect(console.log).toHaveBeenCalledWith('No baseline');
  expect(console.log).toHaveBeenCalledWith(
    expect.stringContaining('| errors | 1 | ≤ 0 | — | — | FAIL |'),
  );
});

test('TC-127: --ci appends Markdown with resolved baseline and failures to step summary', async () => {
  logs();
  vi.stubEnv('GITHUB_STEP_SUMMARY', '/tmp/sourced-test-summary');
  resetEnvForTests();
  const fs = await import('node:fs/promises');
  const original = fs.readFile;
  const baseline = baselineResult('2026-11-09T10:00:00Z');
  vi.spyOn(fs, 'readFile').mockImplementation((...args) =>
    args[0] === 'chosen.json' ? Promise.resolve(JSON.stringify(baseline)) : original(...args),
  );
  expect(await runEval(['--limit', '1', '--no-write', '--ci', '--baseline', 'chosen.json'])).toBe(
    1,
  );
  expect(state.writes).toHaveBeenCalledExactlyOnceWith(
    '/tmp/sourced-test-summary',
    expect.stringContaining('Baseline: chosen.json (2026-11-09T10:00:00Z)'),
  );
});

test('T-47 / FR-61: eval refuses mismatched corpus before provider calls', async () => {
  const error = logs();
  const message =
    'The corpus was indexed with a different embedding model or language. Run ./sourced ingest --rebuild.';
  vi.mocked(checkCorpusSchema).mockRejectedValueOnce(new AppError('CORPUS_MISMATCH', message));
  expect(await runEval(['--limit', '1', '--no-write'])).toBe(2);
  expect(error).toHaveBeenCalledWith(message);
  expect(state.calls).toBe(0);
});
