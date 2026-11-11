import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  CachedAnswerPayload,
  answerCacheKey,
  currentCacheVersion,
  currentCorpusVersion,
  lookupAnswerCache,
  replayAnswerCache,
  writeAnswerCache,
} from '@/lib/cache/answer-cache';
import { closeSqlForTests, getSql } from '@/lib/db/client';
import { resetEnvForTests } from '@/lib/env';
import { PROMPT_VERSION } from '@/lib/prompts/version';
import { SseEvent } from '@/lib/sse/events';
import { SUGGESTED } from '@/lib/suggested';
import { SSE } from '@/lib/config';
import { sha256Hex } from '@/lib/hash';
import { requireLocalDatabase } from '../../helpers/local-database';
import { mockProvider } from '@/lib/llm/mock';
import { cacheSuggested } from '../../../scripts/cache-suggested';

const version = { corpusVersion: 'corpus-a', promptVersion: PROMPT_VERSION, chatModel: 'mock' };
const payload = CachedAnswerPayload.parse({
  meta: {
    cached: false,
    cachedAt: null,
    passages: [
      {
        label: 'P1',
        chunkId: '1',
        documentTitle: 'Indexes',
        headingPath: ['Indexes'],
        officialUrl: 'https://www.postgresql.org/docs/17/indexes.html',
        content: 'Indexes help retrieve rows more quickly.',
        snippet: 'Indexes help retrieve rows more quickly.',
        scores: { rrf: 1 / 61, vectorRank: 1, ftsRank: null, rerankPosition: 1 },
      },
    ],
    retrieval: {
      vectorCandidates: 1,
      ftsCandidates: 0,
      rerankFallback: false,
      rerankFallbackReason: null,
      timingsMs: { embed: 1, search: 2, rerank: 0 },
    },
  },
  answerText: 'According to the documentation, indexes help retrieve rows more quickly [P1].',
  citations: {
    answer: 'According to the documentation, indexes help retrieve rows more quickly [P1].',
    notFound: false,
    valid: [
      {
        label: 'P1',
        quote: 'Indexes help retrieve rows more quickly',
        quoteSpan: { start: 0, end: 37 },
      },
    ],
    invalid: [],
    quoteFallbackUsed: false,
  },
  usageAtGeneration: { embeddingTokens: 10, inputTokens: 20, outputTokens: 30 },
  costUsdAtGeneration: 0.001,
});

beforeEach(async () => {
  await closeSqlForTests();
  await getSql()`TRUNCATE answer_cache, ingest_items, ingest_runs`;
  await getSql()`INSERT INTO ingest_runs (status, finished_at, corpus_version, include_fixtures, embedding_model) VALUES ('succeeded', now(), 'corpus-a', false, 'mock-feature-hash')`;
  vi.stubEnv('DEMO_MODE', 'on');
  resetEnvForTests();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetEnvForTests();
});
const write = (overrides = version) =>
  writeAnswerCache({
    suggestedId: 'partial',
    question: SUGGESTED[1]!.question,
    version: overrides,
    payload,
  });

test('TC-075 / IT-07: cache key includes suggested, corpus, prompt and effective model', async () => {
  expect(answerCacheKey('partial', version)).toBe(
    sha256Hex(`partial|corpus-a|${PROMPT_VERSION}|mock`),
  );
  expect(await currentCacheVersion()).toEqual(version);
  const keys = [
    answerCacheKey('partial', version),
    answerCacheKey('iso', version),
    ...['corpusVersion', 'promptVersion', 'chatModel'].map((field) =>
      answerCacheKey('partial', { ...version, [field]: 'changed' }),
    ),
  ];
  expect(new Set(keys).size).toBe(5);
});

test('TC-075 / IT-07: write, current lookup and overwrite delete obsolete rows', async () => {
  await write({ ...version, promptVersion: 'older' });
  await write();
  await write();
  const cached = await lookupAnswerCache('partial');
  expect(cached).toMatchObject({ stale: false, payload });
  expect(cached?.cachedAt).toMatch(/^\d{4}-/);
  const rows = await getSql()`SELECT cache_key FROM answer_cache WHERE suggested_id = 'partial'`;
  expect(rows).toHaveLength(1);
});

test.each(['corpusVersion', 'promptVersion', 'chatModel'])(
  'TC-075 / IT-07: stale %s only served in readonly',
  async (field) => {
    await write({ ...version, [field]: 'old' });
    expect(await lookupAnswerCache('partial')).toBeNull();
    vi.stubEnv('DEMO_MODE', 'readonly');
    resetEnvForTests();
    expect(await lookupAnswerCache('partial')).toMatchObject({ stale: true, payload });
    vi.stubEnv('DEMO_MODE', 'off');
    resetEnvForTests();
    expect(await lookupAnswerCache('partial')).toBeNull();
  },
);

test('TC-075: readonly chooses the newest stale row, preferring a current row when present', async () => {
  await write({ ...version, promptVersion: 'older' });
  await getSql()`UPDATE answer_cache SET created_at = now() - interval '1 day'`;
  await getSql()`INSERT INTO answer_cache (cache_key, suggested_id, question, corpus_version, prompt_version, chat_model, payload) SELECT 'newer-stale', suggested_id, question, corpus_version, 'newer', chat_model, payload FROM answer_cache`;
  vi.stubEnv('DEMO_MODE', 'readonly');
  resetEnvForTests();
  const newest = await lookupAnswerCache('partial');
  const [row] = await getSql()<
    { created_at: Date }[]
  >`SELECT created_at FROM answer_cache WHERE cache_key = 'newer-stale'`;
  expect(newest?.cachedAt).toBe(row?.created_at.toISOString());
  await write();
  expect((await lookupAnswerCache('partial'))?.stale).toBe(false);
  expect(await lookupAnswerCache('iso')).toBeNull();
});

test('TRD §16.3: corpus version caches for 60 seconds and ignores failed ingest', async () => {
  let now = 0;
  expect(await currentCorpusVersion(() => now)).toBe('corpus-a');
  await getSql()`INSERT INTO ingest_runs (status, finished_at, corpus_version, include_fixtures, embedding_model) VALUES ('succeeded', now() + interval '1 second', 'corpus-b', false, 'mock-feature-hash'), ('failed', now() + interval '2 seconds', 'failed', false, 'mock-feature-hash')`;
  now = 59_999;
  expect(await currentCorpusVersion(() => now)).toBe('corpus-a');
  now = 60_000;
  expect(await currentCorpusVersion(() => now)).toBe('corpus-b');
});

test('FR-29 / D-25: mock cache never hits the live model key', async () => {
  await write();
  vi.stubEnv('LLM_MODE', 'live');
  vi.stubEnv('OPENAI_API_KEY', 'test-placeholder');
  vi.stubEnv('CHAT_MODEL', 'live-model');
  for (const price of [
    'PRICE_CHAT_INPUT_PER_MTOK',
    'PRICE_CHAT_OUTPUT_PER_MTOK',
    'PRICE_EMBED_PER_MTOK',
  ])
    vi.stubEnv(price, '1');
  resetEnvForTests();
  expect(await currentCacheVersion()).toEqual({ ...version, chatModel: 'live-model' });
  expect(await lookupAnswerCache('partial')).toBeNull();
});

test('FR-29 / D-11: cache replay uses original passages and citations, zero tokens/cost and no provider or quota', async () => {
  await write();
  const cached = await lookupAnswerCache('partial');
  expect(cached).not.toBeNull();
  const requestId = randomUUID();
  const events: SseEvent[] = [];
  const embed = vi.spyOn(mockProvider, 'embed');
  const stream = vi.spyOn(mockProvider, 'streamText');
  const before = await getSql()`SELECT * FROM rate_limits`;
  const done = replayAnswerCache({
    cached: cached!,
    requestId,
    emit: (event) => events.push(SseEvent.parse(event)),
  });
  expect(events[0]).toEqual({
    event: 'meta',
    data: { ...payload.meta, requestId, cached: true, cachedAt: cached?.cachedAt },
  });
  const tokens = events.filter((event) => event.event === 'token');
  expect(tokens.map((event) => event.data.delta).join('')).toBe(payload.answerText);
  expect(tokens.every((event) => event.data.delta.length <= SSE.CACHE_REPLAY_CHUNK_CHARS)).toBe(
    true,
  );
  expect(tokens[0]?.data.delta.length).toBe(SSE.CACHE_REPLAY_CHUNK_CHARS);
  expect(events.at(-2)).toEqual({ event: 'citations', data: payload.citations });
  expect(events.at(-1)).toEqual({ event: 'done', data: done });
  expect(done).toMatchObject({
    requestId,
    cached: true,
    usage: { embeddingTokens: 0, inputTokens: 0, outputTokens: 0 },
    costUsdEstimate: 0,
  });
  expect(done.latencyMs.total).toBeGreaterThanOrEqual(0);
  expect(await getSql()`SELECT * FROM rate_limits`).toEqual(before);
  expect(embed).not.toHaveBeenCalled();
  expect(stream).not.toHaveBeenCalled();
});

test('TC-076: seed command creates six validated mock cache rows without API credentials', async () => {
  const databaseUrl = requireLocalDatabase(process.env.TEST_DATABASE_URL);
  const { stdout } = await promisify(execFile)(
    process.execPath,
    ['--import', 'tsx', '--conditions=react-server', 'scripts/seed.ts'],
    {
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        MIGRATION_DATABASE_URL: databaseUrl,
        LLM_MODE: 'mock',
        OPENAI_API_KEY: '',
        MOCK_STREAM_DELAY_MS: '0',
      },
    },
  );
  const rows = await getSql()<
    { suggested_id: string; chat_model: string; payload: unknown }[]
  >`SELECT suggested_id, chat_model, payload FROM answer_cache ORDER BY suggested_id`;
  expect(rows.map((row) => row.suggested_id)).toEqual(SUGGESTED.map((s) => s.id).sort());
  for (const row of rows) {
    expect(row.chat_model).toBe('mock');
    const parsed = CachedAnswerPayload.parse(row.payload);
    expect(parsed.citations.notFound).toBe(false);
    expect(parsed.citations.valid.length).toBeGreaterThan(0);
    expect(parsed.answerText).toBe(parsed.citations.answer);
  }
  expect(stdout).toContain('Cached 6 suggested answers. Estimated cost:');
});

test('TRD §16.3: script refuses to cache a question without a verified citation', async () => {
  await getSql()`TRUNCATE chunks`;
  await expect(cacheSuggested()).rejects.toThrow(`Suggested answer failed: ${SUGGESTED[0]!.id}`);
  expect(await getSql()`SELECT id FROM answer_cache`).toHaveLength(0);
});
