import { createHmac, randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { getDb, getSql } from '@/lib/db/client';
import { queryLog } from '@/lib/db/schema';
import { resetEnvForTests } from '@/lib/env';
import { logQuery, type QueryLogInput } from '@/lib/querylog/log';

const salt = 'querylog-test-only-salt-0000000000000000';
const question = '  ＰＧ_stat_user_tables — ISOLATION,\n level?  ';
const normalized = 'pg stat user tables isolation level';

beforeEach(async () => {
  await getSql()`TRUNCATE query_log`;
  vi.stubEnv('QUESTION_HASH_SALT', salt);
  vi.stubEnv('STORE_QUESTIONS', 'false');
  resetEnvForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvForTests();
});

test.each(['false', 'true'])(
  'TC-079 / FR-54 / NFR-12: STORE_QUESTIONS=%s controls raw text, not hash or length',
  async (store) => {
    vi.stubEnv('STORE_QUESTIONS', store);
    resetEnvForTests();
    const requestId = randomUUID();
    // Extra caller properties must never override privacy-derived columns or persist an IP.
    const input = {
      requestId,
      question,
      source: 'live' as const,
      outcome: 'answered' as const,
      questionText: question,
      questionHash: 'caller-controlled',
      questionLength: 0,
      ip: '192.0.2.1',
    };
    await logQuery(input);
    const rows = await getDb().select().from(queryLog);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      requestId,
      questionText: store === 'true' ? question : null,
      questionLength: question.length,
      questionHash: createHmac('sha256', salt).update(normalized).digest('hex'),
    });
    expect(Object.values(rows[0]!)).not.toContain(input.ip);
  },
);

test('TC-079 / TRD §20.2: equivalent questions group together and changing the salt changes the hash', async () => {
  for (const text of [question, normalized]) {
    await logQuery({
      requestId: randomUUID(),
      question: text,
      source: 'live',
      outcome: 'answered',
    });
  }
  const otherSalt = 'querylog-other-test-only-salt-0000000000';
  vi.stubEnv('QUESTION_HASH_SALT', otherSalt);
  resetEnvForTests();
  const thirdId = randomUUID();
  await logQuery({ requestId: thirdId, question, source: 'live', outcome: 'answered' });
  const rows = await getDb().select().from(queryLog);
  expect(rows).toHaveLength(3);
  for (const row of rows) {
    expect(row.questionHash).toBe(
      createHmac('sha256', row.requestId === thirdId ? otherSalt : salt)
        .update(normalized)
        .digest('hex'),
    );
    expect(row.questionText).toBeNull();
  }
});

test.each([
  ['cache', 'answered', null],
  ['live', 'answered', null],
  ['live', 'not_found', null],
  ['live', 'rate_limited', 'RATE_LIMITED_IP'],
  ['live', 'rate_limited', 'RATE_LIMITED_GLOBAL'],
  ['live', 'aborted', null],
  ['live', 'error', 'PROVIDER_ERROR'],
] as const)(
  'TC-080 / FR-53: logging an eligible %s / %s request inserts one row',
  async (source, outcome, errorCode) => {
    const requestId = randomUUID();
    await logQuery({ requestId, question, source, outcome, errorCode });
    const rows = await getDb().select().from(queryLog);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      requestId,
      source,
      outcome,
      errorCode,
      latencyFirstTokenMs: null,
      tokensInput: null,
      costUsdEstimate: null,
    });
  },
);

test('TC-080 / TRD §6.1, §20.2: preserves supplied cost, usage, quality and timing metadata', async () => {
  const input: QueryLogInput = {
    requestId: randomUUID(),
    question,
    source: 'live',
    outcome: 'answered',
    suggestedId: 'partial',
    chatModel: 'mock',
    embeddingModel: 'mock-feature-hash',
    promptVersion: 'test-version',
    corpusVersion: 'test-corpus',
    passagesCount: 6,
    rerankFallback: false,
    quoteFallbackUsed: true,
    citationsValid: 2,
    citationsInvalid: 1,
    latencyTotalMs: 120,
    latencyFirstTokenMs: 70,
    latencyEmbedMs: 10,
    latencySearchMs: 20,
    latencyRerankMs: 30,
    latencyGenerationMs: 60,
    tokensEmbedding: 10,
    tokensInput: 200,
    tokensOutput: 50,
    costUsdEstimate: 0.001234,
  };
  await logQuery(input);
  const [row] = await getDb().select().from(queryLog);
  const { question: loggedQuestion, costUsdEstimate, ...metadata } = input;
  expect(row).toMatchObject({
    ...metadata,
    questionLength: loggedQuestion.length,
    costUsdEstimate: costUsdEstimate?.toFixed(6),
  });
  expect(row?.createdAt).toBeInstanceOf(Date);
});

test('TC-080 / TRD §6.1: cache request zero cost and usage stay zero', async () => {
  await logQuery({
    requestId: randomUUID(),
    question,
    source: 'cache',
    outcome: 'answered',
    tokensEmbedding: 0,
    tokensInput: 0,
    tokensOutput: 0,
    costUsdEstimate: 0,
  });
  const [row] = await getDb().select().from(queryLog);
  expect(row).toMatchObject({
    tokensEmbedding: 0,
    tokensInput: 0,
    tokensOutput: 0,
    costUsdEstimate: '0.000000',
  });
});
