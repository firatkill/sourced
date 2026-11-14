// TC-205 / FR-72 / NFR-21 / IT-14; TC-207 / FR-65, FR-67 / IT-17.
import { beforeEach, expect, test, vi } from 'vitest';
import { getSql } from '@/lib/db/client';
import { EMBEDDING } from '@/lib/config';
import { getKitConfig } from '@/lib/kit/runtime-config';
import { SourceSchema } from '@/lib/kit/config-schema';
import { loadCorpus } from '@/lib/ingest/load';
import { ingestCorpus } from '@/lib/ingest/upsert';
import { mockProvider } from '@/lib/llm/mock';
import { planIngest } from '@/lib/cli/commands/ingest-report';
import { answerQuestion } from '@/lib/generation/answer';
import { SseEvent } from '@/lib/sse/events';
import type { SourceEvent } from '@/lib/sources/types';
import { ingestDocument } from '../helpers/ingest';

beforeEach(async () => {
  await getSql()`TRUNCATE documents, ingest_runs CASCADE`;
});

async function mixed(events: SourceEvent[] = []) {
  const config = getKitConfig();
  config.sources = [
    SourceSchema.parse({ id: 'mixed', type: 'folder', path: 'tests/fixtures/mixed-folder' }),
  ];
  return loadCorpus({
    config,
    offline: true,
    refresh: false,
    includeFixtures: false,
    onEvent: (event) => events.push(event),
  });
}
const options = () => ({
  sql: getSql(),
  provider: mockProvider,
  embeddingModel: EMBEDDING.MOCK_MODEL,
  includeFixtures: false,
  pricePerMillion: 0,
});

test('TC-205: IT-14 injected interruption resumes only unfinished items with identical final counters', async () => {
  const documents = await mixed();
  let commits = 0;
  const embed = vi.fn(mockProvider.embed.bind(mockProvider));
  await expect(
    ingestCorpus({
      ...options(),
      provider: { embed },
      configHash: 'resume-mixed',
      loadDocuments: () => Promise.resolve(documents),
      onDocument: () => {
        if (++commits === 2) throw new Error('injected interruption');
      },
    }),
  ).rejects.toThrow('injected interruption');
  const sql = getSql();
  const [run] =
    await sql`SELECT id,status,corpus_version FROM ingest_runs ORDER BY id DESC LIMIT 1`;
  expect(run?.status).toBe('failed');
  expect(run?.corpus_version).toBeNull();
  const done = await sql<
    { document_key: string }[]
  >`SELECT document_key FROM ingest_items WHERE status='done'`;
  expect(done.length).toBeGreaterThanOrEqual(2);
  expect(done.length).toBeLessThan(documents.length);
  const committed =
    await sql`SELECT c.id,c.content_hash,c.updated_at FROM chunks c JOIN documents d ON d.id=c.document_id WHERE d.slug = ANY(${sql.array(
      done.map((row) => row.document_key),
      25,
    )}::text[]) ORDER BY c.id`;
  embed.mockClear();
  const resumed = await ingestCorpus({
    ...options(),
    provider: { embed },
    configHash: 'resume-mixed',
    loadDocuments: () => Promise.resolve(documents),
  });
  expect(resumed.runId).toBe(String(run?.id));
  expect(embed).toHaveBeenCalledTimes(documents.length - done.length);
  expect(
    await sql`SELECT c.id,c.content_hash,c.updated_at FROM chunks c JOIN documents d ON d.id=c.document_id WHERE d.slug = ANY(${sql.array(
      done.map((row) => row.document_key),
      25,
    )}::text[]) ORDER BY c.id`,
  ).toEqual(committed);
  const resumedChunks =
    await sql`SELECT d.slug,c.anchor,c.content_hash FROM chunks c JOIN documents d ON d.id=c.document_id ORDER BY d.slug,c.ordinal`;
  // Isolated localhost test database only (integration setup truncates it between tests).
  await sql`TRUNCATE ingest_runs, documents CASCADE`;
  const uninterrupted = await ingestCorpus({
    ...options(),
    configHash: 'resume-mixed',
    loadDocuments: () => Promise.resolve(documents),
  });
  expect(
    await sql`SELECT d.slug,c.anchor,c.content_hash FROM chunks c JOIN documents d ON d.id=c.document_id ORDER BY d.slug,c.ordinal`,
  ).toEqual(resumedChunks);
  for (const key of [
    'documentsTotal',
    'documentsChanged',
    'chunksTotal',
    'chunksInserted',
    'chunksUpdated',
    'chunksUnchanged',
    'chunksDeleted',
    'embeddingInputs',
    'embeddingTokens',
    'corpusVersion',
  ] as const)
    expect(resumed[key]).toEqual(uninterrupted[key]);
});

test('TC-205: SIGINT signal drains active documents, stores interrupted and restart creates a new run', async () => {
  const documents = await mixed();
  const abort = new AbortController();
  let active = 0;
  let maximum = 0;
  const provider = {
    embed: async (...args: Parameters<typeof mockProvider.embed>) => {
      active++;
      maximum = Math.max(maximum, active);
      try {
        abort.abort();
        return await mockProvider.embed(...args);
      } finally {
        active--;
      }
    },
  };
  await expect(
    ingestCorpus({
      ...options(),
      provider,
      signal: abort.signal,
      configHash: 'interrupt',
      loadDocuments: () => Promise.resolve(documents),
    }),
  ).rejects.toThrow('interrupted');
  expect(active).toBe(0);
  expect(maximum).toBeLessThanOrEqual(EMBEDDING.CONCURRENCY);
  const sql = getSql();
  const [old] =
    await sql`SELECT id,status,error,corpus_version FROM ingest_runs ORDER BY id DESC LIMIT 1`;
  expect(old).toMatchObject({ status: 'failed', error: 'interrupted', corpus_version: null });
  const report = await ingestCorpus({
    ...options(),
    configHash: 'interrupt',
    restart: true,
    loadDocuments: () => Promise.resolve(documents),
  });
  expect(report.runId).not.toBe(String(old?.id));
});

test('TC-207: IT-17 all six formats store normative anchors and text citations carry source lines', async () => {
  const documents = await mixed();
  expect(documents.failedKeys).toEqual([]);
  expect(documents).toHaveLength(6);
  const report = await ingestCorpus({
    ...options(),
    loadDocuments: () => Promise.resolve(documents),
  });
  expect(report.documentsTotal).toBe(6);
  const rows = await getSql()<
    { slug: string; anchor: string }[]
  >`SELECT d.slug,c.anchor FROM documents d JOIN chunks c ON c.document_id=d.id`;
  for (const row of rows) {
    const extension = row.slug.split('.').at(-1);
    expect(row.anchor).toMatch(
      extension === 'txt' ? /#l2$/ : extension === 'pdf' ? /#p\d+(?:-\d+)?$/ : /#[^#\s]+$/,
    );
  }
  const txt = documents.find((doc) => doc.mimeType === 'text/plain')!;
  await ingestCorpus({ ...options(), loadDocuments: () => Promise.resolve([txt]) });
  const events: SseEvent[] = [];
  await answerQuestion({
    question: 'When should I water the seed tray?',
    requestId: crypto.randomUUID(),
    signal: new AbortController().signal,
    emit: (event) => {
      events.push(SseEvent.parse(event));
    },
  });
  expect(events.find((event) => event.event === 'meta')?.data.passages[0]).toMatchObject({
    officialUrl: null,
    filePath: 'guide.txt',
    lineFrom: 2,
  });
});

test('TC-206: UT-44 dry-run comparison is read-only and detects unchanged, changed and removed chunks', async () => {
  const events: SourceEvent[] = [];
  const docs = await mixed(events);
  const sql = getSql();
  const fresh = await planIngest(sql, docs, events, EMBEDDING.MOCK_MODEL, 0.02);
  expect(fresh[0]?.documents).toMatchObject({ discovered: 6, done: 6 });
  expect(fresh[0]?.chunks.new).toBe(docs.flatMap((doc) => doc.chunks).length);
  expect(fresh[0]?.estimatedCostUsd).toBe((fresh[0]!.embeddingTokens * 0.02) / 1_000_000);
  expect(await sql`SELECT id FROM ingest_runs`).toHaveLength(0);
  expect(await sql`SELECT id FROM documents`).toHaveLength(0);
  await ingestCorpus({ ...options(), loadDocuments: () => Promise.resolve(docs) });
  const unchanged = await planIngest(sql, docs, events, EMBEDDING.MOCK_MODEL, undefined);
  expect(unchanged[0]?.chunks).toMatchObject({ new: 0, changed: 0, deleted: 0 });
  expect(unchanged[0]?.embeddingTokens).toBe(0);
  expect(unchanged[0]?.estimatedCostUsd).toBeNull();
  const rebuilt = await planIngest(sql, docs, events, EMBEDDING.MOCK_MODEL, 0.02, true);
  expect(rebuilt[0]?.chunks.new).toBe(fresh[0]?.chunks.new);
  expect(rebuilt[0]?.embeddingTokens).toBe(fresh[0]?.embeddingTokens);
  docs[0]!.chunks[0]!.headingPath = ['New heading'];
  expect((await planIngest(sql, docs, events, EMBEDDING.MOCK_MODEL, 0))[0]?.chunks.changed).toBe(1);
});

test('FR-37: successful pruning removes undiscovered documents only from configured sources', async () => {
  const a = { ...ingestDocument('a.txt', ['One document.']), sourceId: 'a', slug: 'a:a.txt' };
  const b = { ...ingestDocument('b.txt', ['Another document.']), sourceId: 'b', slug: 'b:b.txt' };
  await ingestCorpus({
    ...options(),
    loadDocuments: () =>
      Promise.resolve(Object.assign([a, b], { sources: [{ id: 'a' }, { id: 'b' }] })),
  });
  await ingestCorpus({
    ...options(),
    loadDocuments: () => Promise.resolve(Object.assign([], { sources: [{ id: 'a' }] })),
  });
  expect(await getSql()`SELECT slug FROM documents`).toEqual([{ slug: b.slug }]);
});

test('TC-204: UT-42 boilerplate is removed before chunking and its count enters D-109', async () => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const directory = await mkdtemp(join(process.cwd(), 'tests/fixtures/.boilerplate-'));
  try {
    for (let i = 0; i < 10; i++)
      await writeFile(
        join(directory, `${String(i)}.txt`),
        `Document ${String(i)} contains unique guidance.\n\n${i < 5 ? 'Repeated footer.' : `Extra ${String(i)}`}`,
      );
    const config = getKitConfig();
    config.sources = [SourceSchema.parse({ id: 'boilerplate', type: 'folder', path: directory })];
    const events: SourceEvent[] = [];
    const loaded = await loadCorpus({
      config,
      offline: true,
      refresh: false,
      includeFixtures: false,
      onEvent: (event) => {
        events.push(event);
      },
    });
    expect(loaded.boilerplateRemoved).toEqual({ boilerplate: 5 });
    expect(
      loaded
        .flatMap((doc) => doc.chunks)
        .every((chunk) => !chunk.content.includes('Repeated footer')),
    ).toBe(true);
    const planned = await planIngest(getSql(), loaded, events, EMBEDDING.MOCK_MODEL, 0);
    expect(planned[0]?.boilerplateRemoved).toBe(5);
    expect(
      (await ingestCorpus({ ...options(), loadDocuments: () => Promise.resolve(loaded) }))
        .documentsTotal,
    ).toBe(10);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
