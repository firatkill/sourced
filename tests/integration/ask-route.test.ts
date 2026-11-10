import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { POST } from '@/app/api/ask/route';
import * as cache from '@/lib/cache/answer-cache';
import { normalize } from '@/lib/citations/normalize';
import { EMBEDDING, MAINTENANCE, QUESTION, SSE } from '@/lib/config';
import { getSql } from '@/lib/db/client';
import * as db from '@/lib/db/client';
import { getEnv, resetEnvForTests } from '@/lib/env';
import * as envModule from '@/lib/env';
import { AppError, ErrorBody } from '@/lib/errors';
import * as pipeline from '@/lib/generation/answer';
import { hmacSha256Hex, sha256Hex } from '@/lib/hash';
import { chunkDocument } from '@/lib/ingest/chunk';
import { loadManifest } from '@/lib/ingest/manifest';
import { parseHtml } from '@/lib/ingest/parse-html';
import { ingestCorpus } from '@/lib/ingest/upsert';
import { MockDropSignal, mockProvider } from '@/lib/llm/mock';
import * as logging from '@/lib/logger';
import { PROMPT_VERSION } from '@/lib/prompts/version';
import * as limiter from '@/lib/ratelimit/limiter';
import * as search from '@/lib/retrieval/search';
import { SseEvent } from '@/lib/sse/events';
import { createSseParser } from '@/lib/sse/parse';
import { SUGGESTED } from '@/lib/suggested';
import { citations, done, meta } from '../fixtures/sse-streams';

const callbacks = vi.hoisted(() => [] as Array<() => Promise<void>>);
vi.mock('next/server', () => ({
  after: (callback: () => Promise<void>) => callbacks.push(callback),
}));
async function flushAfter() {
  for (const callback of callbacks.splice(0)) await callback();
}
const question = 'How do partial index predicates work?';
function request(
  body: unknown = { question },
  headers: Record<string, string> = {},
  signal?: AbortSignal,
) {
  return new Request('http://localhost:3000/api/ask', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': '192.0.2.50', ...headers },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  });
}
function parseEvents(wire: string) {
  const events: SseEvent[] = [];
  const parser = createSseParser((event) =>
    events.push(SseEvent.parse({ event: event.event, data: JSON.parse(event.data) as unknown })),
  );
  parser.push(wire);
  parser.end();
  return events;
}
async function readResponse(response: Response) {
  const wire = await response.text();
  await flushAfter();
  return parseEvents(wire);
}
async function rows() {
  return getSql()<Record<string, unknown>[]>`SELECT * FROM query_log ORDER BY created_at`;
}
async function counts() {
  return (await getSql()<{ count: number }[]>`SELECT count FROM rate_limits ORDER BY bucket`).map(
    (r) => r.count,
  );
}
let corpusVersion = '';
beforeAll(async () => {
  const manifest = await loadManifest();
  const documents = await Promise.all(
    ['indexes-partial.html', 'transaction-iso.html', 'datatype-json.html'].map(async (slug) => {
      const raw = await readFile(`tests/fixtures/html/${slug}`, 'utf8');
      const parsed = parseHtml(raw, {
        slug,
        section: 'test',
        contentSelector: manifest.contentSelector,
        removeSelectors: manifest.removeSelectors,
      });
      return {
        slug,
        url: new URL(slug, manifest.baseUrl).href,
        title: parsed.title,
        version: manifest.version,
        section: 'test',
        isFixture: false,
        contentHash: sha256Hex(raw),
        chunks: chunkDocument(parsed, slug),
      };
    }),
  );
  const result = await ingestCorpus({
    sql: getSql(),
    loadDocuments: () => Promise.resolve(documents),
    provider: mockProvider,
    embeddingModel: EMBEDDING.MOCK_MODEL,
    includeFixtures: false,
    pricePerMillion: 0,
  });
  corpusVersion = result.corpusVersion;
});
beforeEach(async () => {
  callbacks.length = 0;
  for (const [name, value] of Object.entries({
    DEMO_MODE: 'on',
    MOCK_STREAM_DELAY_MS: '0',
    STORE_QUESTIONS: 'false',
    RATE_LIMIT_IP_DAILY: '10',
    RATE_LIMIT_GLOBAL_DAILY: '300',
    NEXT_PUBLIC_SITE_URL: 'https://sourced.example',
    VERCEL_ENV: 'preview',
    VERCEL_URL: 'deploy.vercel.app',
    VERCEL_BRANCH_URL: 'branch.vercel.app',
    VERCEL_PROJECT_PRODUCTION_URL: 'project.vercel.app',
    ALLOWED_ORIGINS: 'https://extra.example, https://other.example',
  }))
    vi.stubEnv(name, value);
  resetEnvForTests();
  vi.spyOn(Math, 'random').mockReturnValue(1);
  await getSql()`TRUNCATE rate_limits, query_log, answer_cache`;
});
afterEach(async () => {
  await flushAfter();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetEnvForTests();
});

test('TC-080/082 / IT-08: schema-valid stream, headers, quota and one private query log row via after()', async () => {
  const requestId = randomUUID();
  const response = await POST(
    request({ question: `  ${question}  ` }, { 'x-request-id': requestId }),
  );
  expect(response.status).toBe(200);
  expect(Object.fromEntries(response.headers)).toMatchObject({
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
    'x-request-id': requestId,
  });
  const wire = await response.text();
  expect(await rows()).toHaveLength(0);
  expect(callbacks).toHaveLength(1);
  await flushAfter();
  const events = parseEvents(wire);
  expect(events[0]).toMatchObject({ event: 'meta', data: { requestId, cached: false } });
  expect(events.slice(1, -2).length).toBeGreaterThan(0);
  expect(events.slice(1, -2).every((e) => e.event === 'token')).toBe(true);
  expect(events.slice(-2).map((e) => e.event)).toEqual(['citations', 'done']);
  expect(await counts()).toEqual([1, 1]);
  expect(await rows()).toEqual([
    expect.objectContaining({
      request_id: requestId,
      question_text: null,
      question_hash: hmacSha256Hex(getEnv().QUESTION_HASH_SALT, normalize(question)),
      source: 'live',
      outcome: 'answered',
      error_code: null,
      corpus_version: corpusVersion,
      chat_model: 'mock',
      embedding_model: EMBEDDING.MOCK_MODEL,
      prompt_version: PROMPT_VERSION,
    }),
  ]);
  expect(
    JSON.stringify(await rows(), (_key, value: unknown) =>
      typeof value === 'bigint' ? String(value) : value,
    ),
  ).not.toContain('192.0.2.50');
});

test('TC-080 / IT-08: STORE_QUESTIONS=true stores the normalized question', async () => {
  vi.stubEnv('STORE_QUESTIONS', 'true');
  resetEnvForTests();
  await readResponse(await POST(request({ question: ` \n${question}  ` })));
  expect((await rows())[0]?.question_text).toBe(question);
});

test.each([
  [{}, 'question', 'required'],
  [{ question: '' }, 'question', 'required'],
  [{ question: '  a ' }, 'question', 'too_short'],
  [{ question: 'x'.repeat(501) }, 'question', 'too_long'],
  [{ question: 5 }, 'question', 'invalid_type'],
  [null, 'body', 'invalid_type'],
  [[], 'body', 'invalid_type'],
  [{ question, extra: true }, 'body', 'unknown_field'],
  [{ question, suggestedId: 'bogus' }, 'suggestedId', 'invalid_type'],
] as const)(
  'TC-080/081/082: validation failure %# has safe details and no row',
  async (body, field, reason) => {
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    const parsed = ErrorBody.parse(await response.json());
    expect(parsed.error).toMatchObject({ code: 'VALIDATION_FAILED', details: { field, reason } });
    if (reason === 'too_long') expect(parsed.error.details?.length).toBe(501);
    await flushAfter();
    expect(await rows()).toHaveLength(0);
    expect(await counts()).toEqual([]);
  },
);

test.each([
  ['bad JSON', '{', {}, 400, 'VALIDATION_FAILED'],
  ['wrong media type', '{}', { 'content-type': 'text/plain' }, 415, 'UNSUPPORTED_MEDIA_TYPE'],
  [
    'declared byte size',
    '{}',
    { 'content-length': String(QUESTION.MAX_BODY_BYTES + 1) },
    413,
    'PAYLOAD_TOO_LARGE',
  ],
  [
    'actual byte size',
    JSON.stringify({ question: 'é'.repeat(2100) }),
    {},
    413,
    'PAYLOAD_TOO_LARGE',
  ],
  [
    'lying byte size',
    ' '.repeat(QUESTION.MAX_BODY_BYTES + 1),
    { 'content-length': '1' },
    413,
    'PAYLOAD_TOO_LARGE',
  ],
] as const)(
  'TC-080/082: %s precedes origin/mode checks',
  async (_name, body, headers, status, code) => {
    vi.stubEnv('DEMO_MODE', 'off');
    resetEnvForTests();
    const response = await POST(
      new Request('http://localhost/api/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://evil.example', ...headers },
        body,
      }),
    );
    expect(response.status).toBe(status);
    expect(ErrorBody.parse(await response.json()).error.code).toBe(code);
    await flushAfter();
    expect(await rows()).toHaveLength(0);
  },
);

test.each([
  'https://sourced.example',
  'https://deploy.vercel.app',
  'https://branch.vercel.app',
  'https://project.vercel.app',
  'https://extra.example',
  'https://other.example',
  'http://localhost:4321',
  'http://127.0.0.1:4321',
  undefined,
])('TC-082 / D-32: allows origin %s', async (origin) => {
  const response = await POST(request(undefined, origin ? { origin } : {}));
  expect(response.status).toBe(200);
  await readResponse(response);
});
test.each([
  { origin: 'https://evil.example' },
  { origin: 'null' },
  { origin: 'https://sourced.example.evil.test' },
  { origin: 'http://localhost:4321/path' },
  { 'sec-fetch-site': 'cross-site' },
  { origin: 'https://sourced.example', 'sec-fetch-site': 'cross-site' },
])('TC-080/082: rejects forbidden origin/fetch-site %# before mode', async (headers) => {
  vi.stubEnv('DEMO_MODE', 'off');
  resetEnvForTests();
  const response = await POST(request(undefined, headers));
  expect(response.status).toBe(403);
  expect(ErrorBody.parse(await response.json()).error.code).toBe('ORIGIN_FORBIDDEN');
  await flushAfter();
  expect(await rows()).toHaveLength(0);
});

async function writeCache(stale = false) {
  await cache.writeAnswerCache({
    suggestedId: 'partial',
    question: SUGGESTED[1]!.question,
    version: {
      corpusVersion,
      promptVersion: stale ? 'old-version' : PROMPT_VERSION,
      chatModel: 'mock',
    },
    payload: {
      meta,
      citations,
      answerText: citations.answer,
      usageAtGeneration: done.usage,
      costUsdAtGeneration: done.costUsdEstimate,
    },
  });
}
test.each(['on', 'readonly'])(
  'TC-080/082/084: %s cache replay has no quota or provider calls',
  async (mode) => {
    await writeCache();
    vi.stubEnv('DEMO_MODE', mode);
    resetEnvForTests();
    const embed = vi.spyOn(mockProvider, 'embed');
    const stream = vi.spyOn(mockProvider, 'streamText');
    const consume = vi.spyOn(limiter, 'consume');
    // A mismatched explicit id must fall back to canonical question matching.
    const events = await readResponse(
      await POST(request({ question: SUGGESTED[1]!.question.toUpperCase(), suggestedId: 'iso' })),
    );
    expect(events[0]).toMatchObject({ event: 'meta', data: { cached: true } });
    expect(events.at(-1)).toMatchObject({
      event: 'done',
      data: {
        cached: true,
        usage: { embeddingTokens: 0, inputTokens: 0, outputTokens: 0 },
        costUsdEstimate: 0,
      },
    });
    expect(
      events
        .filter((e) => e.event === 'token')
        .map((e) => e.data.delta)
        .join(''),
    ).toBe(citations.answer);
    expect(embed).not.toHaveBeenCalled();
    expect(stream).not.toHaveBeenCalled();
    expect(consume).not.toHaveBeenCalled();
    expect(await counts()).toEqual([]);
    expect(await rows()).toEqual([
      expect.objectContaining({ source: 'cache', outcome: 'answered', suggested_id: 'partial' }),
    ]);
  },
);
test.each(['on', 'readonly'])('TC-084: stale cache in %s', async (mode) => {
  await writeCache(true);
  vi.stubEnv('DEMO_MODE', mode);
  resetEnvForTests();
  const events = await readResponse(
    await POST(request({ question: SUGGESTED[1]!.question, suggestedId: 'partial' })),
  );
  expect(events[0]).toMatchObject({ event: 'meta', data: { cached: mode === 'readonly' } });
  expect(await counts()).toEqual(mode === 'on' ? [1, 1] : []);
});
test.each(['off', 'readonly'])(
  'TC-080/084: %s rejection writes no row, uses no quota',
  async (mode) => {
    await writeCache();
    vi.stubEnv('DEMO_MODE', mode);
    resetEnvForTests();
    const response = await POST(
      request({
        question: mode === 'off' ? SUGGESTED[1]!.question : question,
        suggestedId: 'partial',
      }),
    );
    expect(response.status).toBe(503);
    expect(ErrorBody.parse(await response.json()).error.code).toBe(
      mode === 'off' ? 'DEMO_OFF' : 'DEMO_READONLY',
    );
    await flushAfter();
    expect(await rows()).toHaveLength(0);
    expect(await counts()).toEqual([]);
  },
);
test.each(['IP', 'GLOBAL'])(
  'TC-080/082: %s quota returns reset, Retry-After and one rate_limited row',
  async (scope) => {
    vi.stubEnv(`RATE_LIMIT_${scope}_DAILY`, '1');
    resetEnvForTests();
    await readResponse(await POST(request()));
    const response = await POST(
      request(undefined, scope === 'GLOBAL' ? { 'x-real-ip': '192.0.2.51' } : {}),
    );
    expect(response.status).toBe(429);
    const error = ErrorBody.parse(await response.json()).error;
    expect(error.code).toBe(`RATE_LIMITED_${scope}`);
    expect(error.resetAt).toMatch(/T00:00:00.000Z$/);
    expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(Number(response.headers.get('retry-after'))).toBeLessThanOrEqual(86400);
    await flushAfter();
    expect(await counts()).toEqual([1, 1]);
    expect((await rows()).map((r) => r.outcome)).toEqual(['answered', 'rate_limited']);
    await writeCache();
    expect(
      (await readResponse(await POST(request({ question: SUGGESTED[1]!.question }))))[0],
    ).toMatchObject({ event: 'meta', data: { cached: true } });
    expect(await counts()).toEqual([1, 1]);
  },
);

test.each(['provider-error', 'error-midstream', 'not-found', 'drop'])(
  'TC-080/082: mock:%s terminal behavior, quota and logging',
  async (trigger) => {
    const refunded = vi.spyOn(limiter, 'refund');
    const events = await readResponse(
      await POST(request({ question: `mock:${trigger} ${question}` })),
    );
    const log = (await rows())[0];
    if (trigger === 'not-found') {
      expect(events.at(-2)).toMatchObject({
        event: 'citations',
        data: { answer: '', notFound: true },
      });
      expect(log?.outcome).toBe('not_found');
    } else if (trigger === 'drop') {
      expect(events.map((e) => e.event)).toEqual(['meta', 'token', 'token', 'token']);
      expect(log).toMatchObject({ outcome: 'error', error_code: null });
    } else {
      expect(events.at(-1)).toMatchObject({
        event: 'error',
        data: {
          code: 'PROVIDER_ERROR',
          message: 'The language model did not respond.',
          retryable: true,
          refunded: trigger === 'provider-error',
        },
      });
      expect(log).toMatchObject({ outcome: 'error', error_code: 'PROVIDER_ERROR' });
    }
    expect(refunded).toHaveBeenCalledTimes(trigger === 'provider-error' ? 1 : 0);
    expect(await counts()).toEqual(trigger === 'provider-error' ? [0, 0] : [1, 1]);
  },
);

test('IT-08 / FR-32: duplicate failure signals refund exactly once and write one terminal event/row', async () => {
  const refunded = vi.spyOn(limiter, 'refund');
  vi.spyOn(pipeline, 'answerQuestion').mockImplementation(({ emit, requestId }) => {
    emit({
      event: 'error',
      data: {
        code: 'PROVIDER_ERROR',
        message: 'private provider text',
        requestId,
        retryable: true,
        refunded: false,
      },
    });
    emit({
      event: 'error',
      data: {
        code: 'PROVIDER_ERROR',
        message: 'second failure',
        requestId,
        retryable: true,
        refunded: false,
      },
    });
    return Promise.reject(new AppError('PROVIDER_ERROR', 'third failure'));
  });
  const events = await readResponse(await POST(request()));
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    event: 'error',
    data: { refunded: true, message: 'The language model did not respond.' },
  });
  expect(refunded).toHaveBeenCalledTimes(1);
  expect(await counts()).toEqual([0, 0]);
  expect(await rows()).toHaveLength(1);
});

test.each(['RETRIEVAL_ERROR', 'PROVIDER_TIMEOUT', 'INTERNAL_ERROR'] as const)(
  'IT-08: safe %s before tokens refunds quota',
  async (code) => {
    if (code === 'RETRIEVAL_ERROR')
      vi.spyOn(search, 'search').mockRejectedValueOnce(new Error('private SQL'));
    else
      vi.spyOn(pipeline, 'answerQuestion').mockRejectedValueOnce(
        new AppError(code, 'private details'),
      );
    const events = await readResponse(await POST(request()));
    expect(events.at(-1)).toMatchObject({
      event: 'error',
      data: { code, refunded: true, retryable: true },
    });
    expect(JSON.stringify(events)).not.toContain('private');
    expect(await counts()).toEqual([0, 0]);
  },
);
test('IT-08: unexpected failure before streaming is safe JSON 500', async () => {
  vi.spyOn(limiter, 'consume').mockRejectedValueOnce(new Error('private SQL credentials'));
  const response = await POST(request());
  expect(response.status).toBe(500);
  expect(ErrorBody.parse(await response.json()).error.code).toBe('INTERNAL_ERROR');
  await flushAfter();
  expect((await rows())[0]).toMatchObject({ outcome: 'error', error_code: 'INTERNAL_ERROR' });
});

test('IT-08 / D-32: production rejects localhost and only mock mode handles MockDropSignal', async () => {
  vi.spyOn(envModule, 'getEnv').mockReturnValue({
    ...getEnv(),
    LLM_MODE: 'live',
    VERCEL_ENV: 'production',
  });
  const pipelineSpy = vi.spyOn(pipeline, 'answerQuestion').mockRejectedValue(new MockDropSignal());
  const forbidden = await POST(request(undefined, { origin: 'http://localhost:4321' }));
  expect(forbidden.status).toBe(403);
  expect(pipelineSpy).not.toHaveBeenCalled();
  const events = await readResponse(await POST(request()));
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    event: 'error',
    data: { code: 'INTERNAL_ERROR', refunded: true },
  });
});

test('IT-08 / TRD §12: validates outgoing events in tests and clears heartbeat after error', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  vi.spyOn(pipeline, 'answerQuestion').mockImplementation(({ emit }) => {
    emit({ event: 'token', data: { delta: '' } });
    return Promise.reject(new Error('unreachable'));
  });
  const events = await readResponse(await POST(request()));
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    event: 'error',
    data: { code: 'INTERNAL_ERROR', refunded: true },
  });
  expect(vi.getTimerCount()).toBe(0);
});

test('IT-08 / TRD §12: done closes stream and ignores subsequent writes/failures', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  vi.spyOn(pipeline, 'answerQuestion').mockImplementation(({ emit, requestId }) => {
    emit({ event: 'meta', data: { ...meta, requestId } });
    emit({ event: 'citations', data: citations });
    emit({ event: 'done', data: { ...done, requestId } });
    emit({ event: 'token', data: { delta: '' } });
    return Promise.reject(new Error('late failure'));
  });
  const events = await readResponse(await POST(request()));
  expect(events.map((event) => event.event)).toEqual(['meta', 'citations', 'done']);
  expect(vi.getTimerCount()).toBe(0);
  expect((await rows())[0]?.outcome).toBe('answered');
});

test('TC-070 / IT-08: real mock:slow pipeline sends ping every 15s and clears heartbeat on abort', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  const abort = new AbortController();
  const response = await POST(request({ question: `mock:slow ${question}` }, {}, abort.signal));
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  expect(decoder.decode((await reader.read()).value)).toContain('event: meta');
  await vi.advanceTimersByTimeAsync(SSE.HEARTBEAT_MS - 1);
  await vi.advanceTimersByTimeAsync(1);
  expect(decoder.decode((await reader.read()).value)).toBe(': ping\n\n');
  await vi.advanceTimersByTimeAsync(SSE.HEARTBEAT_MS);
  expect(decoder.decode((await reader.read()).value)).toBe(': ping\n\n');
  abort.abort();
  expect((await reader.read()).done).toBe(true);
  await vi.advanceTimersByTimeAsync(SSE.HEARTBEAT_MS * 2);
  expect(vi.getTimerCount()).toBe(0);
  await flushAfter();
  expect((await rows())[0]?.outcome).toBe('aborted');
  expect(await counts()).toEqual([1, 1]);
});

test.each(['signal', 'cancel'] as const)(
  'IT-08: %s cancels provider, ignores late writes and logs aborted once',
  async (kind) => {
    const client = new AbortController();
    let input: Parameters<typeof pipeline.answerQuestion>[0] | undefined;
    let fail: (error: Error) => void = () => {};
    vi.spyOn(pipeline, 'answerQuestion').mockImplementation((args) => {
      input = args;
      args.emit({ event: 'meta', data: { ...meta, requestId: args.requestId } });
      return new Promise((_resolve, reject) => {
        fail = reject;
      });
    });
    const refunded = vi.spyOn(limiter, 'refund');
    const response = await POST(request(undefined, {}, client.signal));
    const reader = response.body!.getReader();
    await reader.read();
    if (kind === 'signal') client.abort();
    else await reader.cancel();
    client.abort();
    expect(input?.signal.aborted).toBe(true);
    input?.emit({ event: 'token', data: { delta: '' } }); // invalid late event must be ignored before validation
    fail(new AppError('PROVIDER_ERROR', 'failure after cancellation'));
    expect((await reader.read()).done).toBe(true);
    await flushAfter();
    expect(await rows()).toEqual([
      expect.objectContaining({ outcome: 'aborted', error_code: null }),
    ]);
    expect(refunded).not.toHaveBeenCalled();
    expect(await counts()).toEqual([1, 1]);
  },
);

test('IT-08: cleanup only runs in after() below configured probability and deletes expired rows', async () => {
  await getSql()`INSERT INTO rate_limits (bucket, window_start, count) VALUES
    ('expired', (now() AT TIME ZONE 'UTC')::date - ${MAINTENANCE.RATE_LIMIT_RETENTION_DAYS + 1}::int, 1),
    ('retained', (now() AT TIME ZONE 'UTC')::date - ${MAINTENANCE.RATE_LIMIT_RETENTION_DAYS}::int, 1)`;
  const expiredId = randomUUID();
  const retainedId = randomUUID();
  await getSql()`INSERT INTO query_log (request_id, question_hash, question_length, source, outcome, created_at) VALUES
    (${expiredId}, 'expired', 3, 'live', 'answered', now() - make_interval(days => ${MAINTENANCE.QUERY_LOG_RETENTION_DAYS + 1}::int)),
    (${retainedId}, 'retained', 3, 'live', 'answered', now() - make_interval(days => ${MAINTENANCE.QUERY_LOG_RETENTION_DAYS - 1}::int))`;
  const cleanup = vi.spyOn(limiter, 'cleanup');
  vi.mocked(Math.random).mockReturnValue(MAINTENANCE.CLEANUP_PROBABILITY);
  await readResponse(await POST(request()));
  expect(cleanup).not.toHaveBeenCalled();
  vi.mocked(Math.random).mockReturnValue(MAINTENANCE.CLEANUP_PROBABILITY / 2);
  const response = await POST(request());
  await response.text();
  expect(cleanup).not.toHaveBeenCalled();
  expect(await getSql()`SELECT bucket FROM rate_limits WHERE bucket = 'expired'`).toHaveLength(1);
  await flushAfter();
  expect(cleanup).toHaveBeenCalledTimes(1);
  expect(await getSql()`SELECT bucket FROM rate_limits WHERE bucket = 'expired'`).toHaveLength(0);
  expect(await getSql()`SELECT bucket FROM rate_limits WHERE bucket = 'retained'`).toHaveLength(1);
  expect(
    await getSql()`SELECT request_id FROM query_log WHERE request_id = ${expiredId}`,
  ).toHaveLength(0);
  expect(
    await getSql()`SELECT request_id FROM query_log WHERE request_id = ${retainedId}`,
  ).toHaveLength(1);
});

test('IT-08: cleanup errors warn and do not affect response', async () => {
  const logger = logging.withRequest(randomUUID());
  const warn = vi.spyOn(logger, 'warn');
  vi.spyOn(logging, 'withRequest').mockReturnValue(logger);
  vi.mocked(Math.random).mockReturnValue(0);
  const response = await POST(request());
  const wire = await response.text();
  // Fail only the post-response work; the cleanup's own catch must swallow it.
  vi.spyOn(db, 'getSql').mockImplementation(() => {
    throw new Error('private DB failure');
  });
  await flushAfter();
  expect(warn).toHaveBeenCalledWith({ event: 'maintenance.failed' });
  expect(parseEvents(wire).at(-1)?.event).toBe('done');
  expect(response.status).toBe(200);
});
