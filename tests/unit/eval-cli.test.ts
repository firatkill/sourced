import { readFile } from 'node:fs/promises';
import { afterEach, expect, test, vi } from 'vitest';
import { runEval } from '../../scripts/eval';
import { resetEnvForTests } from '@/lib/env';
import { parseGolden, type GoldenCorpus } from '@/lib/eval/golden';

const state = vi.hoisted(() => ({
  fixtures: true,
  ingest: true,
  mismatch: false,
  calls: 0,
  writes: vi.fn(),
}));
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
