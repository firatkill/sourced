// T-65 / FR-82 / UT-46: mixed folder, real DB, mock ingest, persisted report.
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { beforeEach, expect, test, vi } from 'vitest';
import { resetEnvForTests } from '@/lib/env';
import { requireLocalDatabase } from '../helpers/local-database';
import { getSql } from '@/lib/db/client';
import { getKitConfig, setCliKitConfig } from '@/lib/kit/runtime-config';
import { SourceSchema } from '@/lib/kit/config-schema';
import { runIngest } from '@/lib/cli/commands/ingest';
import { parseInvocation } from '@/lib/cli/router';
import { inspectCorpus } from '@/lib/inspect/report';
import { readRunReport } from '@/lib/inspect/run-report';

beforeEach(async () => {
  await getSql()`TRUNCATE documents, ingest_runs, corpus_meta RESTART IDENTITY CASCADE`;
});
test('T-65: mixed folder plus scanned PDF reports OCR, exact boilerplate count, source stats and last-run failures', async () => {
  vi.stubEnv('MIGRATION_DATABASE_URL', requireLocalDatabase(process.env.TEST_DATABASE_URL));
  resetEnvForTests();
  const root = process.cwd();
  const original = getKitConfig(false);
  const dir = await mkdtemp(join(tmpdir(), 'sourced-inspect-'));
  try {
    await cp(join(root, 'tests/fixtures/mixed-folder'), join(dir, 'mixed'), { recursive: true });
    await cp(join(root, 'tests/fixtures/pdf/scanned.pdf'), join(dir, 'mixed/scanned.pdf'));
    // >=10 documents, footer in ten: §33.6 removes ten blocks.
    for (let i = 0; i < 10; i++)
      await writeFile(
        join(dir, `mixed/extra-${String(i)}.txt`),
        `Unique document ${String(i)} about operation ${String(i)}.\n\nRepeated footer.`,
      );
    await writeFile(join(dir, 'mixed/unsupported.xyz'), 'ignored');
    await writeFile(join(dir, 'mixed/empty.txt'), '');
    const config = structuredClone(original);
    config.profile = 'local';
    config.corpus.name = 'inspect-test';
    config.sources = [
      SourceSchema.parse({ id: 'mixed', type: 'folder', path: join(dir, 'mixed') }),
    ];
    await writeFile(join(dir, 'package.json'), '{"type":"module"}');
    await writeFile(join(dir, 'sourced.config.ts'), `export default ${JSON.stringify(config)};`);
    process.chdir(dir);
    const ingested = await runIngest(parseInvocation(['ingest', '--offline', '--yes']), {
      isTTY: false,
      progress: () => {},
    });
    expect(ingested.sources[0]?.boilerplateRemoved).toBe(10);
    const sql = getSql();
    const report = await inspectCorpus(sql, config, dir);
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        code: 'needs_ocr',
        count: 1,
        details: { items: [{ key: 'mixed:scanned.pdf', reason: 'needs_ocr' }] },
      }),
    );
    expect(report.findings).toContainEqual(
      expect.objectContaining({ code: 'boilerplate_removed', sourceId: 'mixed', count: 10 }),
    );
    expect(report.findings).toContainEqual(
      expect.objectContaining({ code: 'empty_document', count: 1 }),
    );
    expect(report.findings).toContainEqual(
      expect.objectContaining({ code: 'skipped_files', count: 1 }),
    );
    const [stats] = await sql<
      { chunks: number; smallest: number; largest: number }[]
    >`SELECT count(*)::int AS chunks, min(token_count) AS smallest, max(token_count) AS largest FROM chunks`;
    expect(report.sources[0]).toMatchObject({
      documents: 16,
      chunks: stats?.chunks,
      smallestChunkTokens: stats?.smallest,
      largestChunkTokens: stats?.largest,
    });
    expect(JSON.parse(await readFile(join(dir, report.path), 'utf8'))).toEqual(report);
    expect(await inspectCorpus(sql, config, dir, 'mixed')).toEqual(report);
    await expect(inspectCorpus(sql, config, dir, 'missing')).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    // Inspect uses DB items, not a report's predicted counters; older failed items are ignored.
    await sql`INSERT INTO ingest_items (run_id, document_key, status, error) VALUES (${ingested.runId}, 'mixed:old', 'failed', 'Old failure.')`;
    const [latest] = await sql<
      { id: string; started_at: Date }[]
    >`INSERT INTO ingest_runs(status,include_fixtures,embedding_model) VALUES ('failed',false,'mock') RETURNING id::text,started_at`;
    expect(latest).toBeDefined();
    await sql`INSERT INTO ingest_items (run_id, document_key, status, error) VALUES (${latest!.id}, 'mixed:new', 'failed', 'Current failure.'), (${latest!.id}, 'other:hidden', 'failed', 'Other failure.')`;
    const failed = await inspectCorpus(sql, config, dir);
    expect(failed.findings.find((f) => f.code === 'failed_items')).toMatchObject({
      count: 1,
      details: { items: [{ key: 'mixed:new', reason: 'Current failure.' }] },
    });
    expect(failed.findings.find((f) => f.code === 'boilerplate_removed')).not.toHaveProperty(
      'count',
    );
    expect(
      await readRunReport(dir, config.corpus.name, ingested.runId!, latest!.started_at),
    ).toBeNull();
  } finally {
    process.chdir(root);
    vi.unstubAllEnvs();
    resetEnvForTests();
    setCliKitConfig(original);
    await rm(dir, { recursive: true, force: true });
  }
});

test('UT-46: duplicates exclude same-document chunks and respect selected sources', async () => {
  const { ingestCorpus } = await import('@/lib/ingest/upsert');
  const { mockProvider } = await import('@/lib/llm/mock');
  const { EMBEDDING } = await import('@/lib/config');
  const { ingestDocument } = await import('../helpers/ingest');
  const dir = await mkdtemp(join(tmpdir(), 'sourced-inspect-pairs-'));
  const config = getKitConfig();
  config.sources = ['a', 'b'].map((id) => SourceSchema.parse({ id, type: 'folder', path: dir }));
  const sql = getSql();
  try {
    const documents = [
      {
        ...ingestDocument(
          'a:one',
          Array.from({ length: 201 }, (_, i) => `Unique chunk ${String(i)}.`),
        ),
        sourceId: 'a',
      },
      { ...ingestDocument('b:two', ['Third chunk.']), sourceId: 'b' },
    ];
    await ingestCorpus({
      sql,
      provider: mockProvider,
      embeddingModel: EMBEDDING.MOCK_MODEL,
      includeFixtures: false,
      pricePerMillion: 0,
      loadDocuments: () => Promise.resolve(Object.assign(documents, { sources: config.sources })),
    });
    const vector = `[${Array.from({ length: config.models.embed.dimensions }, (_, i) => (i === 0 ? 1 : 0)).join(',')}]`;
    await sql`UPDATE chunks SET embedding=${vector}`;
    const selected = await inspectCorpus(sql, config, dir, 'a');
    expect(selected.findings.some((f) => f.code === 'near_duplicates')).toBe(false);
    const all = await inspectCorpus(sql, config, dir);
    expect(all.findings.find((f) => f.code === 'near_duplicates')).toMatchObject({
      count: 200,
      details: { sampledChunks: 200, totalChunks: 202 },
    });
    const ids = await sql<
      { id: string; document_id: string }[]
    >`SELECT id::text, document_id::text FROM chunks`;
    const byId = new Map(ids.map((r) => [r.id, r.document_id]));
    for (const pair of all.findings.find((f) => f.code === 'near_duplicates')?.details?.pairs ??
      []) {
      expect(byId.get(pair.chunkId)).not.toBe(byId.get(pair.otherChunkId));
      expect(pair.similarity).toBe(1);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('FR-82: all-skipped run remains inspectable with null chunk extrema', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sourced-inspect-empty-'));
  try {
    const config = getKitConfig();
    config.sources = [SourceSchema.parse({ id: 'scans', type: 'folder', path: dir })];
    const sql = getSql();
    const [run] = await sql<
      { id: string }[]
    >`INSERT INTO ingest_runs(status,include_fixtures,embedding_model) VALUES ('succeeded',false,'mock') RETURNING id::text`;
    await sql`INSERT INTO ingest_items(run_id,document_key,status,error) VALUES (${run!.id},'scans:scan.pdf','skipped','needs_ocr')`;
    const result = await inspectCorpus(sql, config, dir);
    expect(result.sources).toEqual([
      { id: 'scans', documents: 0, chunks: 0, smallestChunkTokens: null, largestChunkTokens: null },
    ]);
    expect(result.findings).toContainEqual(
      expect.objectContaining({ code: 'needs_ocr', count: 1 }),
    );
    expect(
      result.findings.some((f) =>
        ['tiny_chunks', 'near_duplicates', 'language_mismatch'].includes(f.code),
      ),
    ).toBe(false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
