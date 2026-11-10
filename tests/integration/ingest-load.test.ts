import { expect, test } from 'vitest';
import { loadCorpus } from '@/lib/ingest/load';

test('TC-045: offline loader reads all pinned pages and explicitly includes the synthetic fixture', async () => {
  const documents = await loadCorpus({ offline: true, refresh: false, includeFixtures: true });
  expect(documents).toHaveLength(36);
  expect(documents.filter((doc) => doc.isFixture).map((doc) => doc.slug)).toEqual([
    'injected-notice.html',
  ]);
  expect(documents.every((doc) => doc.chunks.length > 0 && doc.contentHash.length === 64)).toBe(
    true,
  );
  expect(
    documents.find((doc) => doc.isFixture)?.chunks.some((chunk) => chunk.content.includes('PWNED')),
  ).toBe(true);
});

test('UT-38 / FR-68: generic sources detect content and report empty pages without storing them', async () => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { getKitConfig } = await import('@/lib/kit/runtime-config');
  const { SourceSchema } = await import('@/lib/kit/config-schema');
  const { getSql } = await import('@/lib/db/client');
  const { ingestCorpus } = await import('@/lib/ingest/upsert');
  const { mockProvider } = await import('@/lib/llm/mock');
  const { EMBEDDING } = await import('@/lib/config');
  const dir = await mkdtemp(join(process.cwd(), 'tests/fixtures/.generic-html-'));
  const events: import('@/lib/sources/types').SourceEvent[] = [];
  try {
    await writeFile(
      join(dir, 'empty.html'),
      '<title>Empty</title><h1>No blocks</h1><nav><p>Navigation only</p></nav>',
    );
    await writeFile(
      join(dir, 'content.html'),
      '<title>Example</title><nav><p>Excluded navigation</p></nav><main><h1>Content</h1><p>Documentation content.</p></main>',
    );
    const config = getKitConfig();
    config.sources = [SourceSchema.parse({ id: 'generic', type: 'folder', path: dir })];
    const loaded = await loadCorpus({
      offline: true,
      refresh: false,
      includeFixtures: false,
      config,
      onEvent: (event) => events.push(event),
    });
    expect(loaded).toHaveLength(1);
    expect(loaded.failedKeys).toEqual([]);
    expect(events).toContainEqual({ type: 'skipped', key: 'generic:empty.html', reason: 'empty' });
    expect(loaded[0]?.chunks.map((chunk) => chunk.content).join(' ')).toBe(
      'Documentation content.',
    );
    const sql = getSql();
    const report = await ingestCorpus({
      sql,
      loadDocuments: () => Promise.resolve(loaded),
      provider: mockProvider,
      embeddingModel: EMBEDDING.MOCK_MODEL,
      includeFixtures: false,
      pricePerMillion: 0,
    });
    expect(report.documentsTotal).toBe(1);
    const rows = await sql<{ slug: string }[]>`SELECT slug FROM documents`;
    expect(rows).toEqual([{ slug: 'generic:content.html' }]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
