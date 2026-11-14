import { describe, expect, it } from 'vitest';
import {
  CitationsEvent,
  DoneEvent,
  ErrorEvent,
  InvalidReason,
  MetaEvent,
  PassageDto,
  SseEvent,
  TokenEvent,
} from '@/lib/sse/events';
import { citations, done, error, eventExamples, meta, passage } from '../fixtures/sse-streams';

describe('TC-068 / UT-13 / FR-23: normative SSE schemas', () => {
  it.each(eventExamples)('accepts the $event example', (event) => {
    expect(SseEvent.parse(event)).toEqual(event);
  });
  it('accepts cache, fallback, nullable ranks and first-token latency variants', () => {
    expect(
      MetaEvent.safeParse({ ...meta, cached: true, cachedAt: '2026-10-21T12:00:00Z', passages: [] })
        .success,
    ).toBe(true);
    for (const reason of ['timeout', 'error', 'invalid_output', 'empty_output']) {
      expect(
        MetaEvent.safeParse({
          ...meta,
          retrieval: { ...meta.retrieval, rerankFallback: true, rerankFallbackReason: reason },
        }).success,
      ).toBe(true);
    }
    expect(
      PassageDto.safeParse({
        ...passage,
        label: 'P6',
        scores: { ...passage.scores, vectorRank: null, ftsRank: null },
      }).success,
    ).toBe(true);
    expect(
      DoneEvent.safeParse({ ...done, latencyMs: { ...done.latencyMs, firstToken: null } }).success,
    ).toBe(true);
    expect(
      CitationsEvent.safeParse({ ...citations, answer: '', notFound: true, valid: [] }).success,
    ).toBe(true);
  });
  it.each(['UNKNOWN_PASSAGE', 'NO_QUOTE', 'QUOTE_TOO_SHORT', 'QUOTE_TOO_LONG', 'QUOTE_NOT_FOUND'])(
    'accepts invalid citation reason %s',
    (reason) => {
      expect(InvalidReason.safeParse(reason).success).toBe(true);
      expect(
        CitationsEvent.safeParse({ ...citations, invalid: [{ label: 'P99', reason }] }).success,
      ).toBe(true);
    },
  );
  it.each(['PROVIDER_ERROR', 'PROVIDER_TIMEOUT', 'RETRIEVAL_ERROR', 'INTERNAL_ERROR'])(
    'accepts terminal error %s',
    (code) => {
      expect(ErrorEvent.safeParse({ ...error, code }).success).toBe(true);
    },
  );
  it.each([
    { label: 'P0' },
    { label: 'P10' },
    { label: 'P11' },
    { chunkId: 812 },
    { headingPath: [] },
    { headingPath: [1] },
    { officialUrl: 'not a URL' },
    { documentTitle: null },
    { snippet: null },
    { content: null },
    { scores: { ...passage.scores, vectorRank: 0 } },
    { scores: { ...passage.scores, ftsRank: -1 } },
    { scores: { ...passage.scores, vectorRank: 1.5 } },
    { scores: { ...passage.scores, rerankPosition: null } },
    { scores: { ...passage.scores, rerankPosition: 0 } },
    { scores: { ...passage.scores, rrf: '0.03' } },
  ])('rejects malformed passages: %j', (mutation) => {
    expect(PassageDto.safeParse({ ...passage, ...mutation }).success).toBe(false);
  });
  it.each([
    { requestId: '5b0e…' },
    { cached: 'false' },
    { cachedAt: 'yesterday' },
    { passages: Array.from({ length: 10 }, () => passage) },
    { retrieval: { ...meta.retrieval, vectorCandidates: 1.5 } },
    { retrieval: { ...meta.retrieval, ftsCandidates: '17' } },
    { retrieval: { ...meta.retrieval, rerankFallback: 0 } },
    { retrieval: { ...meta.retrieval, rerankFallbackReason: 'other' } },
    { retrieval: { ...meta.retrieval, timingsMs: { embed: '212', search: 38, rerank: 1180 } } },
  ])('rejects malformed meta: %j', (mutation) => {
    expect(MetaEvent.safeParse({ ...meta, ...mutation }).success).toBe(false);
  });
  it.each([{ delta: '' }, { delta: 3 }, {}])('rejects malformed tokens: %j', (value) => {
    expect(TokenEvent.safeParse(value).success).toBe(false);
  });
  it.each([
    { answer: null },
    { notFound: 'false' },
    { quoteFallbackUsed: null },
    { invalid: [{ label: 'P1', reason: 'other' }] },
    { valid: [{ label: 'P10', quote: 'a quote', quoteSpan: { start: 0, end: 7 } }] },
    { valid: [{ label: 'P1', quote: 1, quoteSpan: { start: 0, end: 7 } }] },
    ...[
      { start: -1, end: 7 },
      { start: 0, end: 0 },
      { start: 0.5, end: 7 },
      { start: 0, end: 1.5 },
    ].map((quoteSpan) => ({ valid: [{ label: 'P1', quote: 'a quote', quoteSpan }] })),
  ])('rejects malformed citations: %j', (mutation) => {
    expect(CitationsEvent.safeParse({ ...citations, ...mutation }).success).toBe(false);
  });
  it.each([
    { requestId: 'bad' },
    { cached: null },
    { costUsdEstimate: '0.0016' },
    { usage: { ...done.usage, embeddingTokens: 1.5 } },
    { usage: { ...done.usage, inputTokens: 1.5 } },
    { usage: { ...done.usage, outputTokens: 1.5 } },
    { latencyMs: { ...done.latencyMs, firstToken: '2310' } },
    { latencyMs: { ...done.latencyMs, total: null } },
    { latencyMs: { ...done.latencyMs, generation: null } },
  ])('rejects malformed done: %j', (mutation) => {
    expect(DoneEvent.safeParse({ ...done, ...mutation }).success).toBe(false);
  });
  it.each([
    { code: 'VALIDATION_FAILED' },
    { code: 'MALFORMED_STREAM' },
    { requestId: 'bad' },
    { message: null },
    { retryable: 1 },
    { refunded: 'true' },
  ])('rejects malformed errors: %j', (mutation) => {
    expect(ErrorEvent.safeParse({ ...error, ...mutation }).success).toBe(false);
  });
  it('rejects unknown names, mismatched payloads and missing required fields', () => {
    expect(SseEvent.safeParse({ event: 'other', data: {} }).success).toBe(false);
    for (const event of eventExamples) {
      expect(SseEvent.safeParse({ event: event.event, data: {} }).success).toBe(false);
      for (const key of Object.keys(event.data)) {
        const data = Object.fromEntries(
          Object.entries(event.data).filter(([field]) => field !== key),
        );
        expect(SseEvent.safeParse({ event: event.event, data }).success).toBe(false);
      }
    }
    expect(SseEvent.safeParse({ event: 'done', data: error }).success).toBe(false);
  });
});

it('TC-185 / UT-49 / TRD §31.4: unknown price is accepted as null at the SSE boundary', () => {
  expect(DoneEvent.parse({ ...done, costUsdEstimate: null }).costUsdEstimate).toBeNull();
  expect(DoneEvent.safeParse({ ...done, costUsdEstimate: 'unknown' }).success).toBe(false);
});

it('T-53 / FR-65 / TRD §33.1: file passages require a display path and cannot expose file URLs', () => {
  const file = { ...passage, officialUrl: null, filePath: 'manual/olcum.html' };
  expect(PassageDto.parse(file)).toEqual(file);
  for (const mutation of [
    { officialUrl: null },
    { officialUrl: null, filePath: '' },
    { officialUrl: 'file:///private/manual.html' },
    { officialUrl: '/private/manual.html' },
  ]) {
    expect(PassageDto.safeParse({ ...passage, ...mutation }).success).toBe(false);
  }
});
