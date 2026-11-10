import { expect, test, vi } from 'vitest';
import { getSql } from '@/lib/db/client';
import { EMBEDDING } from '@/lib/config';
import { sha256Hex } from '@/lib/hash';
import { chunkContentHash } from '@/lib/ingest/chunk';
import { ingestCorpus, type IngestDocument } from '@/lib/ingest/upsert';
import { mockProvider } from '@/lib/llm/mock';
import { ingestDocument } from '../helpers/ingest';

const run = (documents: IngestDocument[], contextualEmbedding?: boolean) =>
  ingestCorpus({
    sql: getSql(),
    loadDocuments: () => Promise.resolve(documents),
    provider: mockProvider,
    embeddingModel: EMBEDDING.MOCK_MODEL,
    includeFixtures: false,
    pricePerMillion: 0,
    ...(contextualEmbedding === undefined ? {} : { contextualEmbedding }),
  });

test('T-53 / D-101: source keys are distinct while location hashes and anchors remain stable', async () => {
  const base = ingestDocument('guide.html', ['The identical passage in two different sources.']);
  const a = {
    ...base,
    slug: 'one:https://a.test/guide.html',
    url: 'https://a.test/guide.html',
    locationSlug: 'guide.html',
    sourceId: 'one',
    sourceKind: 'web' as const,
    mimeType: 'text/html',
  };
  const b = {
    ...a,
    slug: 'two:https://b.test/guide.html',
    url: 'https://b.test/guide.html',
    sourceId: 'two',
  };
  // TRD §33.6: this D-101 compatibility case asserts the v1 location-based hashes.
  await run([a], false);
  const report = await run([a, b], false);
  expect(report).toMatchObject({
    documentsTotal: 2,
    chunksTotal: 2,
    chunksInserted: 1,
    chunksUnchanged: 1,
  });
  const rows = await getSql()<
    { slug: string; content_hash: string; anchor: string }[]
  >`SELECT d.slug,d.source_id,c.anchor,c.content_hash FROM documents d JOIN chunks c ON c.document_id=d.id ORDER BY d.slug`;
  expect(rows.map((row) => row.slug)).toEqual([a.slug, b.slug]);
  expect(rows.map((row) => row.content_hash)).toEqual([
    chunkContentHash('guide.html', base.chunks[0]!),
    chunkContentHash('guide.html', base.chunks[0]!),
  ]);
  expect(rows.every((row) => row.anchor === base.chunks[0]?.anchor)).toBe(true);
  const rerun = await run([a, b], false);
  expect(rerun).toMatchObject({
    embeddingInputs: 0,
    chunksUnchanged: 2,
    chunksInserted: 0,
    chunksUpdated: 0,
  });
});

test('T-53 / D-101: Git revisions enter reports and corpus version without changing chunks', async () => {
  const doc = ingestDocument('guide.md', ['A locally checked out handbook.']);
  const sources = [{ id: 'checkout', revision: 'a'.repeat(40) }];
  // TRD §33.6: this corpus-version assertion deliberately uses the v1 chunk hash.
  const report = await run(Object.assign([doc], { sources }), false);
  expect(report.sources).toEqual(sources);
  expect(report.corpusVersion).toBe(
    sha256Hex(
      [chunkContentHash(doc.slug, doc.chunks[0]!), `checkout:${'a'.repeat(40)}`].sort().join('\n'),
    ),
  );
  const changed = await run(
    Object.assign([doc], { sources: [{ id: 'checkout', revision: 'b'.repeat(40) }] }),
    false,
  );
  expect(changed.corpusVersion).not.toBe(report.corpusVersion);
  expect(changed.embeddingInputs).toBe(0);
});

test('T-53 / FR-66: failed item allows successful documents to commit and prevents pruning', async () => {
  const retained = ingestDocument('missing.html', ['Previously ingested document.']);
  await run([retained]);
  const good = ingestDocument('good.html', ['Still available offline.']);
  const embed = vi.fn(mockProvider.embed.bind(mockProvider));
  await expect(
    ingestCorpus({
      sql: getSql(),
      loadDocuments: () => Promise.resolve(Object.assign([good], { failedKeys: ['missing.html'] })),
      provider: { embed },
      embeddingModel: EMBEDDING.MOCK_MODEL,
      includeFixtures: false,
      pricePerMillion: 0,
    }),
  ).rejects.toThrow('successful items were kept');
  const rows = await getSql()<
    { slug: string; content_hash: string; anchor: string }[]
  >`SELECT slug FROM documents ORDER BY slug`;
  expect(rows.map((row) => row.slug)).toEqual(['good.html', 'missing.html']);
  expect(embed).toHaveBeenCalledOnce();
  const [latest] = await getSql()`SELECT status FROM ingest_runs ORDER BY id DESC LIMIT 1`;
  expect(latest?.status).toBe('failed');
});

test('T-53 / D-101: v1 URL uniqueness permits transactional replacement with the v2 key', async () => {
  const old = ingestDocument('guide.html', ['The original version-one passage.']);
  // TRD §33.6: v1-to-v2 identity replacement must retain the asserted v1 chunk hash.
  await run([old], false);
  const next = {
    ...old,
    slug: `docs:${old.url}`,
    locationSlug: old.slug,
    sourceId: 'docs',
    sourceKind: 'web' as const,
  };
  const report = await run([next], false);
  expect(report).toMatchObject({
    documentsTotal: 1,
    documentsRemoved: 1,
    chunksInserted: 1,
    chunksDeleted: 1,
  });
  const rows = await getSql()<
    { slug: string; content_hash: string; anchor: string }[]
  >`SELECT d.slug,c.content_hash FROM documents d JOIN chunks c ON c.document_id=d.id`;
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    slug: next.slug,
    content_hash: chunkContentHash(old.slug, old.chunks[0]!),
  });
});
