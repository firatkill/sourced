import { readFile } from 'node:fs/promises';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import { EMBEDDING, RETRIEVAL } from '@/lib/config';
import { getSql } from '@/lib/db/client';
import { sha256Hex } from '@/lib/hash';
import { chunkDocument } from '@/lib/ingest/chunk';
import { loadManifest } from '@/lib/ingest/manifest';
import { parseHtml } from '@/lib/ingest/parse-html';
import { ingestCorpus, type IngestDocument } from '@/lib/ingest/upsert';
import { mockProvider } from '@/lib/llm/mock';
import { embedQuery } from '@/lib/retrieval/embed-query';
import { retrieve } from '@/lib/retrieval/pipeline';
import * as searchModule from '@/lib/retrieval/search';

beforeAll(async () => {
  const manifest = await loadManifest();
  const documents: IngestDocument[] = [];
  for (const slug of ['indexes-partial.html', 'transaction-iso.html', 'datatype-json.html']) {
    const raw = await readFile(`tests/fixtures/html/${slug}`, 'utf8');
    const parsed = parseHtml(raw, {
      slug,
      section: 'test',
      html: {
        preset: 'postgres-docbook' as const,
        contentSelector: manifest.contentSelector,
        removeSelectors: manifest.removeSelectors,
      },
    });
    documents.push({
      slug,
      url: new URL(slug, manifest.baseUrl).href,
      title: parsed.title,
      version: manifest.version,
      section: 'test',
      isFixture: false,
      contentHash: sha256Hex(raw),
      chunks: chunkDocument(parsed, slug),
    });
  }
  await ingestCorpus({
    sql: getSql(),
    loadDocuments: () => Promise.resolve(documents),
    provider: mockProvider,
    embeddingModel: EMBEDDING.MOCK_MODEL,
    includeFixtures: false,
    pricePerMillion: 0,
  });
});

afterEach(() => vi.restoreAllMocks());

test('TC-062: FR-12–FR-14 retrieves fixture passages with provenance, usage and timings', async () => {
  const question = 'When can PostgreSQL use a partial index predicate?';
  const embedding = await mockProvider.embed([question]);
  const result = await retrieve(question);
  expect(result.candidates.length).toBeGreaterThan(0);
  expect(result.candidates.length).toBeLessThanOrEqual(RETRIEVAL.RERANK_CANDIDATES);
  expect(result.passages).toHaveLength(Math.min(result.reranked.length, RETRIEVAL.FINAL_PASSAGES));
  expect(result.reranked.map((chunk) => chunk.chunkId).sort()).toEqual(
    result.candidates.map((chunk) => chunk.chunkId).sort(),
  );
  result.passages.forEach((passage, index) => {
    expect(passage).toMatchObject(result.reranked[index]!);
    expect(passage.label).toBe(`P${String(index + 1)}`);
    expect(passage.rerankPosition).toBe(index + 1);
    const fragment = passage.anchor.split('#')[1];
    expect(fragment).toBeTruthy();
    expect(passage.officialUrl).toBe(`${passage.documentUrl}#${String(fragment)}`);
  });
  expect(result.rerankFallback).toBe(false);
  expect(result.rerankFallbackReason).toBeNull();
  expect(result.usage.embeddingTokens).toBe(embedding.tokens);
  for (const timing of Object.values(result.timingsMs)) {
    expect(Number.isFinite(timing)).toBe(true);
    expect(timing).toBeGreaterThanOrEqual(0);
  }
  expect(Object.keys(result.timingsMs).sort()).toEqual(['embed', 'rerank', 'search']);
  expect(result.usage.rerankInputTokens).toBeGreaterThanOrEqual(0);
  expect(result.usage.rerankOutputTokens).toBeGreaterThanOrEqual(0);
});

test('TC-062: TRD §18 maps SQL failure to a safe RETRIEVAL_ERROR', async () => {
  vi.spyOn(searchModule, 'search').mockRejectedValueOnce(new Error('private SQL details'));
  await expect(retrieve('partial index')).rejects.toMatchObject({
    code: 'RETRIEVAL_ERROR',
    message: 'Search failed.',
  });
});

test.each([429, 500, 503, 'network'])(
  'TC-062: TRD §9.1 retries transient embedding failure %s once',
  async (failure) => {
    const embed = vi
      .spyOn(mockProvider, 'embed')
      .mockRejectedValueOnce(
        failure === 'network' ? new TypeError('fetch failed') : { statusCode: failure },
      );
    const result = await embedQuery('  partial index?  ');
    expect(result.vector).toHaveLength(EMBEDDING.DIMENSIONS);
    expect(embed).toHaveBeenCalledTimes(2);
    expect(embed.mock.calls.every(([values]) => values[0] === '  partial index?  ')).toBe(true);
  },
);

test('TC-062: TRD §9.1 exhausts exactly one retry and maps provider errors', async () => {
  const embed = vi.spyOn(mockProvider, 'embed').mockRejectedValue({ statusCode: 503 });
  await expect(embedQuery('partial index')).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
  expect(embed).toHaveBeenCalledTimes(2);
});

test.each([400, 401])('TC-062: TRD §9.1 does not retry HTTP %s', async (statusCode) => {
  const embed = vi.spyOn(mockProvider, 'embed').mockRejectedValue({ statusCode });
  await expect(embedQuery('partial index')).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
  expect(embed).toHaveBeenCalledTimes(1);
});

test('TC-062: TRD §9.1 applies the configured timeout and maps aborts', async () => {
  const timeout = vi
    .spyOn(AbortSignal, 'timeout')
    .mockReturnValue(AbortSignal.abort(new DOMException('Timed out', 'TimeoutError')));
  await expect(embedQuery('partial index')).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT' });
  expect(timeout).toHaveBeenCalledWith(EMBEDDING.QUERY_TIMEOUT_MS);
});

test('TC-062: TRD §9.4 request cancellation propagates', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(retrieve('partial index', controller.signal)).rejects.toBe(controller.signal.reason);
});

test('TC-063: FR-12 empty chunks return zero passages without an error', async () => {
  // The integration setup confines this connection to the local test database.
  await getSql()`TRUNCATE chunks`;
  const result = await retrieve('partial index');
  expect(result.candidates).toEqual([]);
  expect(result.reranked).toEqual([]);
  expect(result.passages).toEqual([]);
  expect(result.rerankFallback).toBe(false);
  expect(result.rerankFallbackReason).toBeNull();
  expect(result.timingsMs.rerank).toBe(0);
  expect(result.usage).toMatchObject({ rerankInputTokens: 0, rerankOutputTokens: 0 });
});
