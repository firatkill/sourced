import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import { EMBEDDING, GENERATION, RETRIEVAL } from '@/lib/config';
import { getSql } from '@/lib/db/client';
import { resetEnvForTests } from '@/lib/env';
import { answerQuestion } from '@/lib/generation/answer';
import { loadCorpus } from '@/lib/ingest/load';
import { ingestCorpus } from '@/lib/ingest/upsert';
import { mockProvider } from '@/lib/llm/mock';
import { SseEvent } from '@/lib/sse/events';
import * as searchModule from '@/lib/retrieval/search';

beforeAll(async () => {
  await ingestCorpus({
    sql: getSql(),
    loadDocuments: () => loadCorpus({ offline: true, refresh: false, includeFixtures: false }),
    provider: mockProvider,
    embeddingModel: EMBEDDING.MOCK_MODEL,
    includeFixtures: false,
    pricePerMillion: 0,
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetEnvForTests();
});
function run(trigger = '') {
  vi.stubEnv('MOCK_STREAM_DELAY_MS', '0');
  resetEnvForTests();
  const events: SseEvent[] = [];
  const promise = answerQuestion({
    question: `${trigger} When should I use a partial index?`,
    requestId: randomUUID(),
    signal: new AbortController().signal,
    emit: (event) => events.push(SseEvent.parse(event)),
  });
  return { events, promise };
}

test('TC-074: FR-09/22 default mock emits meta → token+ → citations → done', async () => {
  const { events, promise } = run();
  const result = await promise;
  expect(events[0]?.event).toBe('meta');
  expect(events.slice(1, -2).length).toBeGreaterThan(0);
  expect(events.slice(1, -2).every((e) => e.event === 'token')).toBe(true);
  expect(events.slice(-2).map((e) => e.event)).toEqual(['citations', 'done']);
  expect(result.verification.notFound).toBe(false);
  expect(result.verification.valid.length).toBeGreaterThan(0);
  expect(result.verification.invalid).toEqual([]);
  expect(result.meta.passages).toHaveLength(RETRIEVAL.FINAL_PASSAGES);
  expect(
    result.meta.passages.every(
      (p) => p.snippet.endsWith('…') && p.content.startsWith(p.snippet.slice(0, -1)),
    ),
  ).toBe(true);
  const text = events
    .filter((e) => e.event === 'token')
    .map((e) => e.data.delta)
    .join('');
  expect(text).not.toContain(GENERATION.CITATIONS_DELIMITER);
  expect(text).not.toContain('"citations"');
  expect(result.done.usage.inputTokens).toBe(
    result.usage.rerank.inputTokens + result.usage.generation.inputTokens,
  );
  expect(result.done.latencyMs.firstToken).not.toBeNull();
  expect(result.timingsMs.total).toBeGreaterThanOrEqual(result.timingsMs.firstToken!);
});

test('TC-074: mock:not-found clears draft text', async () => {
  const { promise } = run('mock:not-found');
  expect((await promise).verification).toMatchObject({
    answer: '',
    notFound: true,
    valid: [],
    quoteFallbackUsed: false,
  });
});

test('TC-074: mock:invalid-citation removes exactly two citations', async () => {
  const { promise } = run('mock:invalid-citation');
  const { verification } = await promise;
  expect(verification.invalid).toEqual([
    { label: 'P3', reason: 'QUOTE_NOT_FOUND' },
    { label: 'P9', reason: 'UNKNOWN_PASSAGE' },
  ]);
  expect(verification.valid).toHaveLength(2);
  expect(verification.answer).not.toMatch(/\[P[39]\]/);
});

test('TC-074: mock:no-block uses one bounded quote fallback and includes its usage', async () => {
  const spy = vi.spyOn(mockProvider, 'generateObject');
  const { promise } = run('mock:no-block');
  const result = await promise;
  expect(result.verification).toMatchObject({
    notFound: false,
    quoteFallbackUsed: true,
    invalid: [],
  });
  const fallbacks = spy.mock.calls.filter(([args]) => args.prompt.includes('Cited ids:'));
  expect(fallbacks).toHaveLength(1);
  expect(fallbacks[0]?.[0]).toMatchObject({
    maxOutputTokens: GENERATION.QUOTE_FALLBACK_MAX_OUTPUT_TOKENS,
  });
  expect(fallbacks[0]?.[0].abortSignal).toBeInstanceOf(AbortSignal);
  expect(result.usage.fallback.inputTokens).toBeGreaterThan(0);
  expect(result.done.usage.inputTokens).toBe(
    result.usage.rerank.inputTokens +
      result.usage.generation.inputTokens +
      result.usage.fallback.inputTokens,
  );
});

test.each([undefined, '900'])(
  'TC-060: generation passes env MAX_OUTPUT_TOKENS (%s), default 700',
  async (value) => {
    vi.stubEnv('MAX_OUTPUT_TOKENS', value);
    const spy = vi.spyOn(mockProvider, 'streamText');
    await run().promise;
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ maxOutputTokens: value ? 900 : 700 }),
    );
  },
);

test('TRD §14.1: extracts delimiter-free JSON tail and avoids fallback', async () => {
  const original = mockProvider.streamText.bind(mockProvider);
  vi.spyOn(mockProvider, 'streamText').mockImplementation((args) => {
    const stream = original(args);
    return {
      usage: stream.usage,
      textStream: (async function* () {
        let text = '';
        for await (const delta of stream.textStream) text += delta;
        yield text.replace(GENERATION.CITATIONS_DELIMITER, '');
      })(),
    };
  });
  const result = await run().promise;
  expect(result.verification).toMatchObject({
    notFound: false,
    quoteFallbackUsed: false,
    invalid: [],
  });
  expect(result.verification.answer).not.toContain('"citations"');
});

test.each(['provider-error', 'error-midstream'])(
  'TRD §14.4: mock:%s fails safely without done',
  async (trigger) => {
    const { events, promise } = run(`mock:${trigger}`);
    await expect(promise).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
      message: 'The language model did not respond.',
      options: { retryable: true },
    });
    expect(events.some((e) => e.event === 'done')).toBe(false);
    expect(events.some((e) => e.event === 'token')).toBe(trigger === 'error-midstream');
  },
);

test('TRD §13.3: failed quote fallback removes all unsupported citations', async () => {
  const original = mockProvider.generateObject.bind(mockProvider);
  vi.spyOn(mockProvider, 'generateObject').mockImplementation((args) => {
    if (args.prompt.includes('Cited ids:'))
      return Promise.reject(new Error('private provider failure'));
    return original(args);
  });
  const result = await run('mock:no-block').promise;
  expect(result.verification).toMatchObject({
    notFound: true,
    answer: '',
    quoteFallbackUsed: true,
    valid: [],
  });
  expect(result.verification.invalid.every((i) => i.reason === 'NO_QUOTE')).toBe(true);
});

test('TRD §14.4: first-token watchdog cancels stalled generation', async () => {
  const original = globalThis.setTimeout;
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(((callback: () => void, ms?: number) =>
    original(callback, ms === GENERATION.FIRST_TOKEN_TIMEOUT_MS ? 0 : ms)) as typeof setTimeout);
  vi.spyOn(mockProvider, 'streamText').mockImplementation(() => ({
    usage: Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
    textStream: { [Symbol.asyncIterator]: () => ({ next: () => new Promise(() => {}) }) },
  }));
  const { events, promise } = run();
  await expect(promise).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT' });
  expect(events.map((e) => e.event)).toEqual(['meta']);
});

test('TRD §14.4: retrieval SQL failure remains RETRIEVAL_ERROR', async () => {
  vi.spyOn(searchModule, 'search').mockRejectedValueOnce(new Error('private SQL'));
  const { events, promise } = run();
  await expect(promise).rejects.toMatchObject({
    code: 'RETRIEVAL_ERROR',
    message: 'Search failed.',
  });
  expect(events).toEqual([]);
});

test('FR-09: zero passages skips generation and yields not-found', async () => {
  await getSql()`TRUNCATE chunks`;
  const spy = vi.spyOn(mockProvider, 'streamText');
  const { events, promise } = run();
  const result = await promise;
  expect(events.map((e) => e.event)).toEqual(['meta', 'citations', 'done']);
  expect(result.verification).toMatchObject({ notFound: true, answer: '', valid: [] });
  expect(result.done.latencyMs).toMatchObject({ firstToken: null, generation: 0 });
  expect(spy).not.toHaveBeenCalled();
});
