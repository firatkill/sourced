// D-128 / FR-65, FR-83 / TRD §32.1, §36.1–36.2.
import { expect, test, vi } from 'vitest';
import { KitConfigSchema } from '@/lib/kit/config-schema';
import { loadCorpus } from '@/lib/ingest/load';
import { previewCorpus } from '@/lib/ingest/preview';
import { ingestCorpus } from '@/lib/ingest/upsert';
import { cacheFs, rawFilename } from '@/lib/sources/urls';
import { getSql } from '@/lib/db/client';
import { EMBEDDING } from '@/lib/config';
import { mockProvider } from '@/lib/llm/mock';
import { generateAnswerCandidate, type GenerationChunk } from '@/lib/eval/generate';
import { GoldenEntry } from '@/lib/eval/golden';
import fixtureConfig from '../fixtures/kit-tr/sourced.config';

test('D-128: sitemap slugs survive preview, persistence and candidate generation without collisions', async () => {
  const paths = ['a/', 'b/', '', 'core/indexes/create-index/'];
  const expected = ['a', 'b', 'index', 'core/indexes/create-index'];
  const root = 'https://example.test/manual/';
  const sitemap = `${root}sitemap.xml`;
  const files = new Map<string, Uint8Array>([
    [
      rawFilename(sitemap),
      Buffer.from(
        `<urlset>${paths.map((path) => `<url><loc>${root}${path}</loc></url>`).join('')}</urlset>`,
      ),
    ],
    ...paths.map((path): [string, Uint8Array] => [
      rawFilename(`${root}${path}`),
      Buffer.from(
        `<main><h1>Manual</h1><h2 id="learn-more">Learn more</h2><p>This page explains how to create and manage an index for ${path || 'the manual'} with the documented commands.</p></main>`,
      ),
    ]),
  ]);
  const read = vi
    .spyOn(cacheFs, 'read')
    .mockImplementation((path) => Promise.resolve(files.get(path.split('/').at(-1)!)));
  try {
    const config = KitConfigSchema.parse({
      ...fixtureConfig,
      sources: [{ id: 'manual', type: 'sitemap', url: sitemap }],
    });
    const documents = await loadCorpus({
      config,
      offline: true,
      refresh: false,
      includeFixtures: false,
    });
    expect(documents.failedKeys).toEqual([]);
    expect(documents.map((doc) => doc.locationSlug)).toEqual(expected);
    expect(documents.map((doc) => doc.chunks[0]?.anchor)).toEqual(
      expected.map((slug) => `${slug}#learn-more`),
    );
    const preview = previewCorpus(documents, 0, false);
    const report = await ingestCorpus({
      sql: getSql(),
      loadDocuments: () => Promise.resolve(documents),
      provider: mockProvider,
      embeddingModel: EMBEDDING.MOCK_MODEL,
      includeFixtures: false,
      pricePerMillion: 0,
      contextualEmbedding: false,
    });
    expect(report.chunksTotal).toBe(4);
    expect(preview.corpusVersion).toBe(report.corpusVersion);
    const corpus = await getSql()<
      GenerationChunk[]
    >`SELECT c.id::text, d.id::text AS "documentId", d.source_id AS "sourceId", d.section AS "group", c.ordinal, c.anchor, c.heading_path AS "headingPath", c.content, c.token_count AS "tokenCount" FROM chunks c JOIN documents d ON d.id=c.document_id ORDER BY c.id`;
    expect(new Set(corpus.map((chunk) => chunk.anchor)).size).toBe(4);
    for (const chunk of corpus) {
      const candidate = await generateAnswerCandidate(chunk, corpus, mockProvider, () =>
        Promise.resolve([chunk.id]),
      );
      expect(candidate.expected_anchors).toEqual([chunk.anchor]);
      expect(GoldenEntry.shape.expected_anchors.safeParse(candidate.expected_anchors).success).toBe(
        true,
      );
    }
  } finally {
    read.mockRestore();
  }
});
