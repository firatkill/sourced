import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { GET, runtime, dynamic } from '@/app/api/health/route';
import { closeSqlForTests, getSql } from '@/lib/db/client';
import { resetEnvForTests } from '@/lib/env';
import { HealthResponse } from '@/lib/http/health';

beforeEach(async () => {
  vi.stubEnv('DEMO_MODE', 'on');
  vi.stubEnv('VERCEL_GIT_COMMIT_SHA', '');
  resetEnvForTests();
  await getSql()`TRUNCATE documents, chunks, ingest_runs CASCADE`;
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvForTests();
});

test('TC-086 / IT-10 / FR-51: 200 with exact counts and latest successful corpus', async () => {
  const sql = getSql();
  await sql`INSERT INTO documents (slug, url, title, version, section, content_hash, fetched_at)
    VALUES ('health', 'https://example.test/health', 'Health', '17', 'test', ${'a'.repeat(64)}, now())`;
  await sql`INSERT INTO chunks (document_id, ordinal, heading_path, anchor, content, token_count, content_hash, embedding_model, embedding)
    SELECT id, 0, ARRAY['Health'], 'health#root', 'Health passage', 2, ${'b'.repeat(64)}, 'mock', ${JSON.stringify(Array<number>(1536).fill(0))}::vector FROM documents`;
  await sql`INSERT INTO ingest_runs (status, finished_at, corpus_version, include_fixtures, embedding_model)
    VALUES ('succeeded', '2026-01-01', 'old', false, 'mock'),
    ('succeeded', '2026-01-02', 'latest', false, 'mock'),
    ('failed', '2026-01-03', 'failed', false, 'mock'),
    ('running', null, null, false, 'mock')`;
  vi.stubEnv('VERCEL_GIT_COMMIT_SHA', '123456789abcdef');
  resetEnvForTests();
  const before = Date.now();
  const response = await GET();
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  const body = HealthResponse.parse(await response.json());
  expect(body).toEqual({
    status: 'ok',
    db: 'ok',
    demoMode: 'on',
    llmMode: 'mock',
    version: '1234567',
    corpus: { version: 'latest', documents: 1, chunks: 1 },
    time: body.time,
  });
  expect(Date.parse(body.time)).toBeGreaterThanOrEqual(before);
  expect(Date.parse(body.time)).toBeLessThanOrEqual(Date.now());
  expect(runtime).toBe('nodejs');
  expect(dynamic).toBe('force-dynamic');
});

test.each(['on', 'readonly', 'off'])(
  'TC-086 / TRD §11.3: empty corpus in %s mode',
  async (mode) => {
    vi.stubEnv('DEMO_MODE', mode);
    resetEnvForTests();
    const response = await GET();
    expect(response.status).toBe(200);
    expect(HealthResponse.parse(await response.json())).toMatchObject({
      status: 'ok',
      db: 'ok',
      demoMode: mode,
      llmMode: 'mock',
      version: 'local',
      corpus: { version: null, documents: 0, chunks: 0 },
    });
  },
);

test('TC-086 / IT-10: closed database port returns 503 without database details', async () => {
  const original = process.env.DATABASE_URL;
  try {
    process.env.DATABASE_URL = 'postgres://x:x@127.0.0.1:1/x';
    resetEnvForTests();
    await closeSqlForTests();
    const response = await GET();
    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const body: unknown = await response.json();
    expect(body).toEqual({
      status: 'degraded',
      db: 'error',
      corpus: null,
      demoMode: 'on',
      llmMode: 'mock',
      version: 'local',
      time: HealthResponse.parse(body).time,
    });
  } finally {
    if (original === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original;
    resetEnvForTests();
    await closeSqlForTests();
  }
  expect((await GET()).status).toBe(200);
});

test('TC-086 / TRD §11.3: blocked database check degrades after 3,000 ms', async () => {
  const blocker = await getSql().reserve();
  try {
    await blocker`BEGIN`;
    await blocker`LOCK TABLE documents IN ACCESS EXCLUSIVE MODE`;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let settled = false;
    const pending = GET().then((response) => {
      settled = true;
      return response;
    });
    await vi.advanceTimersByTimeAsync(2_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const response = await pending;
    expect(response.status).toBe(503);
    expect(HealthResponse.parse(await response.json())).toMatchObject({
      status: 'degraded',
      db: 'error',
      corpus: null,
    });
  } finally {
    vi.useRealTimers();
    await blocker`ROLLBACK`;
    blocker.release();
  }
  expect((await GET()).status).toBe(200);
});
