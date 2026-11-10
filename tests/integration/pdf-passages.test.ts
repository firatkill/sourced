// TC-200 / FR-67, FR-70 / IT-17: stored PDF page ranges reach verified SSE citations.
import { expect, test } from 'vitest';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { getKitConfig } from '@/lib/kit/runtime-config';
import { SourceSchema } from '@/lib/kit/config-schema';
import { loadCorpus } from '@/lib/ingest/load';
import { rawFilename } from '@/lib/sources/urls';
import type { SourceEvent } from '@/lib/sources/types';
import { sha256Hex } from '@/lib/hash';
import { getSql } from '@/lib/db/client';
import { EMBEDDING } from '@/lib/config';
import { ingestCorpus } from '@/lib/ingest/upsert';
import { mockProvider } from '@/lib/llm/mock';
import { answerQuestion } from '@/lib/generation/answer';
import { SseEvent } from '@/lib/sse/events';
import { ingestDocument } from '../helpers/ingest';

test.each(['file', 'web'] as const)(
  'TC-200: %s PDF page ranges survive storage, reuse, retrieval and SSE',
  async (kind) => {
    const base = ingestDocument('guide.pdf', [
      'The seed tray needs water every morning. Keep the seed tray warm until shoots appear.',
    ]);
    const document = {
      ...base,
      slug: `pdf:${kind === 'web' ? 'https://docs.test/guide.pdf' : 'manual/guide.pdf'}`,
      url: kind === 'web' ? 'https://docs.test/guide.pdf' : 'manual/guide.pdf',
      sourceId: 'pdf',
      sourceKind: kind,
      mimeType: 'application/pdf',
      locationSlug: 'guide.pdf',
      chunks: base.chunks.map((chunk) => ({
        ...chunk,
        anchor: 'guide.pdf#p2-3',
        pageFrom: 2,
        pageTo: 3,
      })),
    };
    const run = () =>
      ingestCorpus({
        sql: getSql(),
        loadDocuments: () => Promise.resolve([document]),
        provider: mockProvider,
        embeddingModel: EMBEDDING.MOCK_MODEL,
        includeFixtures: false,
        pricePerMillion: 0,
      });
    expect((await run()).chunksInserted).toBe(1);
    const sql = getSql();
    expect((await sql`SELECT page_from, page_to FROM chunks`)[0]).toMatchObject({
      page_from: 2,
      page_to: 3,
    });
    // Force metadata correction on the known-hash path, without re-embedding content.
    await sql`UPDATE chunks SET page_to = NULL`;
    expect(await run()).toMatchObject({ chunksUpdated: 1, embeddingInputs: 0 });
    expect(await run()).toMatchObject({ chunksUnchanged: 1, embeddingInputs: 0 });
    const events: SseEvent[] = [];
    const result = await answerQuestion({
      question: 'How do I care for the seed tray?',
      requestId: crypto.randomUUID(),
      signal: new AbortController().signal,
      emit: (event) => {
        events.push(SseEvent.parse(event));
      },
    });
    expect(result.verification.notFound).toBe(false);
    const meta = events.find((event) => event.event === 'meta');
    expect(meta?.data.passages[0]).toMatchObject({
      pageFrom: 2,
      pageTo: 3,
      ...(kind === 'file'
        ? { officialUrl: null, filePath: 'manual/guide.pdf' }
        : { officialUrl: 'https://docs.test/guide.pdf#page=2' }),
    });
  },
);

test('TC-200 / UT-40: folder PDFs ingest pages and report/skip scanned files', async () => {
  const config = getKitConfig();
  config.sources = [
    SourceSchema.parse({
      id: 'pdf',
      type: 'folder',
      path: 'tests/fixtures/pdf',
      include: ['*.pdf'],
    }),
  ];
  const events: SourceEvent[] = [];
  const documents = await loadCorpus({
    config,
    offline: true,
    refresh: false,
    includeFixtures: false,
    onEvent: (event) => events.push(event),
  });
  expect(documents.map((doc) => doc.slug).sort()).toEqual([
    'pdf:headings.pdf',
    'pdf:info-title.pdf',
    'pdf:pages.pdf',
  ]);
  expect(documents.failedKeys).toEqual([]);
  expect(events).toContainEqual({ type: 'skipped', key: 'pdf:scanned.pdf', reason: 'needs_ocr' });
  expect(documents.find((doc) => doc.slug === 'pdf:info-title.pdf')?.title).toBe(
    'Garden metadata title',
  );
  expect(
    documents.every((doc) =>
      doc.chunks.every((chunk) => chunk.pageFrom !== undefined && chunk.pageTo !== undefined),
    ),
  ).toBe(true);
  const report = await ingestCorpus({
    sql: getSql(),
    loadDocuments: () => Promise.resolve(documents),
    provider: mockProvider,
    embeddingModel: EMBEDDING.MOCK_MODEL,
    includeFixtures: false,
    pricePerMillion: 0,
  });
  expect(report.documentsTotal).toBe(3);
  expect(
    await getSql()`SELECT d.slug, c.page_from, c.page_to FROM documents d JOIN chunks c ON c.document_id=d.id ORDER BY d.slug, c.ordinal`,
  ).toEqual([
    expect.objectContaining({ slug: 'pdf:headings.pdf', page_from: 1, page_to: 2 }),
    // TRD §10.4: the merged intro/planting chunk exceeds the 40-token tiny threshold;
    // the following caring section stays a separate page-2 chunk.
    expect.objectContaining({ slug: 'pdf:headings.pdf', page_from: 2, page_to: 2 }),
    expect.objectContaining({ slug: 'pdf:info-title.pdf', page_from: 1, page_to: 1 }),
    expect.objectContaining({ slug: 'pdf:pages.pdf', page_from: 1, page_to: 2 }),
  ]);
});

test('TC-200 / FR-70: web dispatch accepts application/pdf without an extension and .pdf with a generic MIME', async () => {
  const config = getKitConfig();
  config.corpus.name = `pdf-${crypto.randomUUID()}`;
  const directory = join('corpus', config.corpus.name);
  const raw = join(directory, 'raw', 'pdf');
  const entries = [
    { url: 'https://docs.test/download', mimeType: 'application/pdf', fixture: 'info-title.pdf' },
    { url: 'https://docs.test/guide.pdf', mimeType: 'text/plain', fixture: 'headings.pdf' },
    { url: 'https://docs.test/scan', mimeType: 'application/pdf', fixture: 'scanned.pdf' },
  ];
  config.sources = [
    SourceSchema.parse({ id: 'pdf', type: 'urls', urls: entries.map((entry) => entry.url) }),
  ];
  await mkdir(raw, { recursive: true });
  try {
    const index: Record<string, unknown> = {};
    for (const entry of entries) {
      const bytes = await readFile(`tests/fixtures/pdf/${entry.fixture}`);
      await writeFile(join(raw, rawFilename(entry.url, entry.mimeType)), bytes);
      index[entry.url] = {
        url: entry.url,
        mimeType: entry.mimeType,
        etag: null,
        'last-modified': null,
        contentHash: sha256Hex(bytes),
        fetchedAt: '2026-11-10T00:00:00.000Z',
      };
    }
    await writeFile(join(raw, 'index.json'), JSON.stringify(index));
    const events: SourceEvent[] = [];
    const docs = await loadCorpus({
      config,
      offline: true,
      refresh: false,
      includeFixtures: false,
      onEvent: (event) => events.push(event),
    });
    expect(docs.map((doc) => doc.title)).toEqual(['Garden metadata title', 'Garden handbook']);
    expect(docs.failedKeys).toEqual([]);
    expect(events).toContainEqual({
      type: 'skipped',
      key: 'pdf:https://docs.test/scan',
      reason: 'needs_ocr',
    });
    expect(
      docs.every((doc) => doc.chunks.every((chunk) => chunk.anchor.match(/#p\d+(?:-\d+)?$/))),
    ).toBe(true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
