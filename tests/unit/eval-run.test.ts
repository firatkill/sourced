import { afterEach, expect, test, vi } from 'vitest';
import { checkPreconditions, evaluateQuestions, runEval } from '../../scripts/eval';
import { GoldenEntry } from '@/lib/eval/golden';
import type { AnswerOutcome } from '@/lib/generation/answer';
import { resetEnvForTests } from '@/lib/env';

const golden = GoldenEntry.parse({
  id: 'q001',
  type: 'answerable',
  chapter: 'indexes',
  question: 'When should I create a partial index?',
  expected_anchors: ['indexes.html#INDEXES'],
  reference_answer: '',
});
const outcome: AnswerOutcome = {
  candidates: [],
  reranked: [],
  passages: [],
  retrieval: {
    vectorCandidates: 0,
    ftsCandidates: 0,
    candidates: [],
    reranked: [],
    passages: [],
    rerankFallback: false,
    rerankFallbackReason: null,
    usage: { embeddingTokens: 0, rerankInputTokens: 0, rerankOutputTokens: 0 },
    timingsMs: { embed: 1, search: 1, rerank: 1 },
  },
  meta: {
    requestId: 'f2ba1f54-1b8d-4ed9-9080-56901b6ab987',
    cached: false,
    cachedAt: null,
    passages: [],
    retrieval: {
      vectorCandidates: 0,
      ftsCandidates: 0,
      rerankFallback: false,
      rerankFallbackReason: null,
      timingsMs: { embed: 1, search: 1, rerank: 1 },
    },
  },
  verification: {
    answer: 'Verified answer [P1].',
    notFound: false,
    valid: [],
    invalid: [],
    quoteFallbackUsed: false,
  },
  usage: {
    embeddingTokens: 0,
    rerank: { inputTokens: 0, outputTokens: 0 },
    generation: { inputTokens: 10, outputTokens: 10 },
    fallback: { inputTokens: 0, outputTokens: 0 },
  },
  timingsMs: { embed: 1, search: 1, rerank: 1, total: 42, firstToken: 4, generation: 38 },
  done: {
    requestId: 'f2ba1f54-1b8d-4ed9-9080-56901b6ab987',
    cached: false,
    usage: { embeddingTokens: 0, inputTokens: 10, outputTokens: 10 },
    costUsdEstimate: 0,
    latencyMs: { total: 42, firstToken: 4, generation: 38 },
  },
};
const prices = { chatInput: 1, chatOutput: 1, judgeInput: 1, judgeOutput: 1, embed: 1 };
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  resetEnvForTests();
});

test('TC-124 / FR-41: exact configuration errors and mock write exit 2', async () => {
  const valid = {
    mode: 'mock' as const,
    noWrite: true,
    hasFixtures: true,
    hasIngest: true,
    modelMismatch: false,
  };
  expect(() => {
    checkPreconditions(valid);
  }).not.toThrow();
  for (const change of [{ hasFixtures: false }, { hasIngest: false }])
    expect(() => {
      checkPreconditions({ ...valid, ...change });
    }).toThrow('Run pnpm ingest --include-fixtures first');
  expect(() => {
    checkPreconditions({ ...valid, modelMismatch: true });
  }).toThrow('Re-run pnpm ingest --offline --include-fixtures in the current LLM_MODE');
  expect(() => {
    checkPreconditions({ ...valid, noWrite: false });
  }).toThrow(expect.objectContaining({ exitCode: 2 }));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  expect(await runEval(['--limit', '1'])).toBe(2);
});

test('TC-125 / FR-41: sequential calls have unique ids; judge only answered answerable', async () => {
  const answer = vi.fn().mockResolvedValue(outcome);
  const judge = vi
    .fn()
    .mockResolvedValue({ score: 1, unsupported_claims: [], rationale: 'supported' });
  const records = await evaluateQuestions(
    [
      golden,
      { ...golden, id: 'q002', type: 'unanswerable', expected_anchors: [] },
      {
        ...golden,
        id: 'q003',
        type: 'injection',
        expected_anchors: [],
        forbidden_strings: ['PWNED'],
      },
    ],
    { mode: 'mock', prices, limitUsd: 1, answer, judge },
  );
  expect(records).toHaveLength(3);
  expect(judge).toHaveBeenCalledTimes(1);
  expect(judge).toHaveBeenCalledWith(
    'Verified answer [P1].',
    [],
    expect.objectContaining({ onUsage: expect.any(Function) as unknown }),
  );
  expect(
    new Set(answer.mock.calls.map((call) => (call[0] as { requestId: string }).requestId)).size,
  ).toBe(3);
  expect(records[0]?.result.latencyMs).toBe(42);
  const refusal = vi.fn().mockResolvedValue({
    ...outcome,
    verification: { ...outcome.verification, notFound: true, answer: '' },
  });
  judge.mockClear();
  await evaluateQuestions([golden], { mode: 'mock', prices, limitUsd: 1, answer: refusal, judge });
  expect(judge).not.toHaveBeenCalled();
});

test('TC-122 / FR-44: budget stops before next call and before reports', async () => {
  vi.stubEnv('PRICE_CHAT_INPUT_PER_MTOK', '100000');
  vi.stubEnv('PRICE_CHAT_OUTPUT_PER_MTOK', '100000');
  resetEnvForTests();
  const answer = vi.fn().mockResolvedValue(outcome);
  const judge = vi.fn();
  await expect(
    evaluateQuestions([golden, golden], { mode: 'live', prices, limitUsd: 1, answer, judge }),
  ).rejects.toMatchObject({ exitCode: 3 });
  expect(answer).toHaveBeenCalledTimes(1);
  expect(judge).not.toHaveBeenCalled();
});

test('TC-119 / FR-41: failed judge records error, retains known cost and answer latency', async () => {
  const records = await evaluateQuestions([golden], {
    mode: 'mock',
    prices,
    limitUsd: 1,
    answer: vi.fn().mockResolvedValue(outcome),
    judge: vi.fn().mockRejectedValue(new Error('judge failed')),
  });
  expect(records[0]?.result).toMatchObject({
    outcome: 'error',
    faithfulness: null,
    pass: false,
    latencyMs: 42,
  });
  const failed = await evaluateQuestions([golden], {
    mode: 'mock',
    prices,
    limitUsd: 1,
    answer: vi.fn().mockRejectedValue(new Error('answer failed')),
    now: vi.fn().mockReturnValueOnce(10).mockReturnValueOnce(20),
  });
  expect(failed[0]?.result).toMatchObject({ outcome: 'error', latencyMs: 10 });
});

test('TC-122 / FR-44: accrued judge cost aborts before the next question', async () => {
  const answer = vi.fn().mockResolvedValue(outcome);
  const judge: typeof import('@/lib/eval/judge').judgeAnswer = (_answer, _passages, options) => {
    options?.onUsage?.({ inputTokens: 2_000_000, outputTokens: 0 });
    return Promise.resolve({ score: 1, unsupported_claims: [], rationale: 'supported' });
  };
  await expect(
    evaluateQuestions([golden, golden], { mode: 'live', prices, limitUsd: 1, answer, judge }),
  ).rejects.toMatchObject({ exitCode: 3 });
  expect(answer).toHaveBeenCalledTimes(1);
});

test('TC-123 / FR-42: records verified citations in passage-label order and both call costs', async () => {
  const passages: AnswerOutcome['passages'] = ['P1', 'P2'].map((label, i) => ({
    label: label as 'P1' | 'P2',
    chunkId: String(i),
    documentTitle: 'Indexes',
    documentUrl: 'https://www.postgresql.org/docs/17/indexes.html',
    slug: 'indexes.html',
    anchor: i === 0 ? 'indexes.html#INDEXES' : 'indexes.html#OTHER',
    headingPath: ['Indexes'],
    content: 'The exact documentation sentence for this passage.',
    tokenCount: 10,
    rrfScore: 0.1,
    vectorRank: i + 1,
    ftsRank: i + 1,
    vectorDistance: 0.1,
    ftsScore: 0.1,
    rerankPosition: i + 1,
    officialUrl: 'https://www.postgresql.org/docs/17/indexes.html#INDEXES',
  }));
  const answer = vi
    .fn()
    .mockImplementation(
      (input: Parameters<typeof import('@/lib/generation/answer').answerQuestion>[0]) => {
        input.emit({ event: 'done', data: outcome.done });
        return Promise.resolve({
          ...outcome,
          passages,
          candidates: [...passages].reverse(),
          reranked: passages,
          verification: {
            ...outcome.verification,
            valid: ['P2', 'P1'].map((label) => ({
              label,
              quote: 'The exact documentation sentence for this passage.',
              quoteSpan: { start: 0, end: 46 },
            })),
          },
        });
      },
    );
  const judge: typeof import('@/lib/eval/judge').judgeAnswer = (_answer, _passages, options) => {
    options?.onUsage?.({ inputTokens: 100, outputTokens: 50 });
    return Promise.resolve({
      score: 0.5,
      unsupported_claims: ['minor detail'],
      rationale: 'mostly supported',
    });
  };
  const [record] = await evaluateQuestions([golden], {
    mode: 'mock',
    prices,
    limitUsd: 1,
    answer,
    judge,
  });
  expect(record?.result).toMatchObject({
    pass: true,
    outcome: 'answered',
    recallAt5: 1,
    recallAt10: 1,
    reciprocalRank: 1,
    citedAnchors: ['indexes.html#INDEXES', 'indexes.html#OTHER'],
    faithfulness: { score: 0.5, unsupportedClaims: ['minor detail'] },
  });
  expect(record?.rrfTop20Anchors).toEqual(['indexes.html#OTHER', 'indexes.html#INDEXES']);
  expect(record?.passageLabels).toEqual(['P1', 'P2']);
  expect(record?.judgeCostUsd).toBe(0.00015);
  expect(record?.result.costUsd).toBe((record?.answerCostUsd ?? 0) + 0.00015);
});

test('TC-185 / UT-49 / TRD §31.4: missing role price stops legacy eval before any provider call', async () => {
  const runtime = await import('@/lib/kit/runtime-config');
  const config = runtime.getKitConfig(false);
  config.models.rerank = { provider: 'gemini', model: 'unpriced-rerank' };
  vi.spyOn(runtime, 'getKitConfig').mockReturnValue(config);
  const answer = vi.fn().mockResolvedValue(outcome);
  const judge = vi.fn();
  await expect(
    evaluateQuestions([golden], { mode: 'mock', prices, limitUsd: 1, answer, judge }),
  ).rejects.toThrow(
    'Price unknown for gemini:unpriced-rerank; add it to pricing in sourced.config.ts to get an estimate.',
  );
  expect(answer).not.toHaveBeenCalled();
  expect(judge).not.toHaveBeenCalled();
});
