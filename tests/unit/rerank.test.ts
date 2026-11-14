import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { JSONParseError } from 'ai';
import { RETRIEVAL } from '@/lib/config';
import { AppError, PROVIDER_ERROR_MESSAGE, PROVIDER_TIMEOUT_MESSAGE } from '@/lib/errors';
import { encode } from '@/lib/ingest/tokenizer';
import { mockProvider } from '@/lib/llm/mock';
import { buildRerankPrompt, RERANK_SYSTEM_PROMPT } from '@/lib/prompts/rerank';
import { rerank, RerankOutput } from '@/lib/retrieval/rerank';
import type { RetrievedChunk } from '@/lib/retrieval/types';

const doubles = vi.hoisted(() => ({ generateObject: vi.fn(), warn: vi.fn() }));
vi.mock('@/lib/llm', async (original) => ({
  ...(await original<typeof import('@/lib/llm')>()),
  getProviders: () => ({ rerank: { generateObject: doubles.generateObject } }),
}));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ warn: doubles.warn }) }));

const candidates: RetrievedChunk[] = Array.from({ length: 8 }, (_, index) => ({
  chunkId: String(index + 1),
  documentTitle: 'Indexes',
  documentUrl: 'https://www.postgresql.org/docs/17/indexes.html',
  slug: 'indexes',
  anchor: `indexes#section-${String(index)}`,
  headingPath: ['Indexes', 'Types'],
  content: `Passage ${String(index + 1)}.`,
  tokenCount: 5,
  rrfScore: 1 / (60 + index + 1),
  vectorRank: index + 1,
  ftsRank: null,
  vectorDistance: 0.1,
  ftsScore: null,
}));
const signal = () => new AbortController().signal;
const usage = { inputTokens: 123, outputTokens: 12 };
function output(object: unknown) {
  doubles.generateObject.mockResolvedValue({ object, usage });
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('TC-061 / UT-06 / FR-13 / TRD §9.4', () => {
  test('one listwise chat call applies ranking and appends omitted candidates in RRF order', async () => {
    output({ ranking: ['r3', 'R1', 'R8'] });
    const result = await rerank('Which index?', candidates, signal());
    expect(result.reranked.map((c) => c.chunkId)).toEqual(['3', '1', '8', '2', '4', '5', '6', '7']);
    expect(result).toMatchObject({ rerankFallback: false, rerankFallbackReason: null, usage });
    expect(result.rerankMs).toBeGreaterThanOrEqual(0);
    expect(doubles.generateObject).toHaveBeenCalledExactlyOnceWith({
      model: 'rerank',
      system: RERANK_SYSTEM_PROMPT,
      prompt: buildRerankPrompt('Which index?', candidates),
      schema: RerankOutput,
      maxOutputTokens: RETRIEVAL.RERANK_MAX_OUTPUT_TOKENS,
      abortSignal: expect.any(AbortSignal) as unknown,
    });
    expect(doubles.warn).not.toHaveBeenCalled();
  });
  test('drops unknown candidate ids and duplicates, preserving the first occurrence', async () => {
    output({ ranking: ['R20', 'r4', 'R4', 'R2', 'r2', 'R19'] });
    const result = await rerank('Question', candidates, signal());
    expect(result.reranked.map((c) => c.chunkId)).toEqual(['4', '2', '1', '3', '5', '6', '7', '8']);
    expect(result.rerankFallback).toBe(false);
    expect(candidates.map((c) => c.chunkId)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
  });
  test.each([{ ranking: [] }, { ranking: ['R20'] }])(
    'empty valid ranking $ranking falls back',
    async ({ ranking }) => {
      output({ ranking });
      const result = await rerank('Question', candidates, signal());
      expect(result).toMatchObject({
        reranked: candidates,
        rerankFallback: true,
        rerankFallbackReason: 'empty_output',
        usage,
      });
      expect(doubles.warn).toHaveBeenCalledExactlyOnceWith({
        event: 'rerank.fallback',
        reason: 'empty_output',
      });
    },
  );
  test.each([
    {},
    { ranking: [1] },
    { ranking: ['R0'] },
    { ranking: ['R21'] },
    { ranking: Array<string>(21).fill('R1') },
  ])('invalid output %j falls back', async (object) => {
    output(object);
    expect(await rerank('Question', candidates, signal())).toMatchObject({
      reranked: candidates,
      rerankFallback: true,
      rerankFallbackReason: 'invalid_output',
    });
  });
  test('wrapped SDK parse failure is invalid_output', async () => {
    doubles.generateObject.mockRejectedValue(
      new AppError('PROVIDER_ERROR', PROVIDER_ERROR_MESSAGE, {
        cause: new JSONParseError({ text: 'invalid', cause: new Error('parse') }),
      }),
    );
    expect(await rerank('Question', candidates, signal())).toMatchObject({
      rerankFallback: true,
      rerankFallbackReason: 'invalid_output',
    });
  });
  test('seven candidates invoke reranking', async () => {
    output({ ranking: ['R7'] });
    const result = await rerank(
      'Question',
      candidates.slice(0, RETRIEVAL.FINAL_PASSAGES + 1),
      signal(),
    );
    expect(result.reranked[0]?.chunkId).toBe('7');
    expect(doubles.generateObject).toHaveBeenCalledTimes(1);
  });
  test('provider-side Zod rejection falls back as invalid_output', async () => {
    doubles.generateObject.mockImplementation(() => RerankOutput.parse({ ranking: ['bad'] }));
    expect(await rerank('Question', candidates, signal())).toMatchObject({
      reranked: candidates,
      rerankFallbackReason: 'invalid_output',
    });
  });
  test('provider error falls back without logging private details', async () => {
    doubles.generateObject.mockRejectedValue(
      new AppError('PROVIDER_ERROR', PROVIDER_ERROR_MESSAGE, {
        cause: new Error('private model output'),
      }),
    );
    expect(await rerank('private question', candidates, signal())).toMatchObject({
      reranked: candidates,
      rerankFallback: true,
      rerankFallbackReason: 'error',
    });
    expect(doubles.warn).toHaveBeenCalledExactlyOnceWith({
      event: 'rerank.fallback',
      reason: 'error',
    });
  });
  test.each([0, 1, RETRIEVAL.FINAL_PASSAGES])(
    '%i candidates skip the call with zero timing and usage',
    async (count) => {
      const subset = candidates.slice(0, count);
      expect(await rerank('Question', subset, signal())).toEqual({
        reranked: subset,
        rerankFallback: false,
        rerankFallbackReason: null,
        rerankMs: 0,
        usage: { inputTokens: 0, outputTokens: 0 },
      });
      expect(doubles.generateObject).not.toHaveBeenCalled();
    },
  );
  test('timeout aborts the provider at exactly 4,000 ms (fake timers)', async () => {
    vi.useFakeTimers();
    // Node's native AbortSignal.timeout uses internal timers; route it through the fake clock.
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
      const controller = new AbortController();
      setTimeout(() => {
        controller.abort(new DOMException('Timeout', 'TimeoutError'));
      }, ms);
      return controller.signal;
    });
    let providerSignal: AbortSignal | undefined;
    doubles.generateObject.mockImplementation(({ abortSignal }: { abortSignal: AbortSignal }) => {
      providerSignal = abortSignal;
      return new Promise((_, reject) => {
        abortSignal.addEventListener(
          'abort',
          () => {
            reject(new AppError('PROVIDER_TIMEOUT', PROVIDER_TIMEOUT_MESSAGE));
          },
          { once: true },
        );
      });
    });
    const done = vi.fn();
    const pending = rerank('Question', candidates, signal()).then((result) => {
      done();
      return result;
    });
    await vi.advanceTimersByTimeAsync(RETRIEVAL.RERANK_TIMEOUT_MS - 1);
    expect(done).not.toHaveBeenCalled();
    expect(providerSignal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(providerSignal?.aborted).toBe(true);
    expect(await pending).toMatchObject({
      reranked: candidates,
      rerankFallback: true,
      rerankFallbackReason: 'timeout',
    });
    expect(timeoutSpy).toHaveBeenCalledWith(RETRIEVAL.RERANK_TIMEOUT_MS);
  });
  test.each([true, false])(
    'client cancellation propagates as abort, already aborted=%s',
    async (before) => {
      const controller = new AbortController();
      if (before) controller.abort();
      doubles.generateObject.mockImplementation(() => {
        controller.abort();
        throw new AppError('PROVIDER_TIMEOUT', PROVIDER_TIMEOUT_MESSAGE);
      });
      await expect(rerank('Question', candidates, controller.signal)).rejects.toMatchObject({
        name: 'AbortError',
      });
      expect(doubles.warn).not.toHaveBeenCalled();
      if (before) expect(doubles.generateObject).not.toHaveBeenCalled();
    },
  );
  test('mock provider runs without network and retains all candidates', async () => {
    doubles.generateObject.mockImplementation(
      (args: Parameters<typeof mockProvider.generateObject>[0]) =>
        mockProvider.generateObject(args),
    );
    expect(await rerank('Question', candidates, signal())).toMatchObject({
      reranked: candidates,
      rerankFallback: false,
    });
  });
  test('long passages end at a whole word plus ellipsis within the token cap', async () => {
    output({ ranking: ['R1'] });
    const content = 'PostgreSQL documentation '.repeat(200);
    const long = candidates.map((candidate) => ({ ...candidate, content }));
    const result = await rerank('Question', long, signal());
    const args = doubles.generateObject.mock.calls[0]?.[0] as { prompt: string };
    const excerpt = args.prompt.split('[R1] Indexes › Types\n')[1]?.split('\n\n')[0];
    expect(excerpt).toMatch(/(?:PostgreSQL|documentation)…$/);
    expect(encode(excerpt ?? '').length).toBeLessThanOrEqual(RETRIEVAL.RERANK_PASSAGE_MAX_TOKENS);
    expect(result.reranked[0]?.content).toBe(content);
  });
});
