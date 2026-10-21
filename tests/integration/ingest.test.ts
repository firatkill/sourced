import { readFile } from 'node:fs/promises';
import { loadManifest } from '@/lib/ingest/manifest';
import { parseHtml } from '@/lib/ingest/parse-html';
import { chunkDocument } from '@/lib/ingest/chunk';
import { sha256Hex } from '@/lib/hash';
import { expect, test } from 'vitest';
import { getSql } from '@/lib/db/client';
import { EMBEDDING } from '@/lib/config';
import { mockProvider } from '@/lib/llm/mock';
import { ingestCorpus, type IngestDocument } from '@/lib/ingest/upsert';
import { formatIngestReport } from '@/lib/ingest/report';
import { ingestDocument } from '../helpers/ingest';

test('TC-045: IT-04 stores chunks, provenance, vector dimensions and a matching succeeded report', async () => {
  const sql = getSql();
  const doc = ingestDocument('report.html', [
    'Partial indexes select rows by a predicate.',
    'Transactions isolate concurrent changes.',
  ]);
  const report = await ingestCorpus({
    sql,
    loadDocuments: () => Promise.resolve([doc]),
    provider: mockProvider,
    embeddingModel: EMBEDDING.MOCK_MODEL,
    includeFixtures: false,
    pricePerMillion: 0.02,
  });
  expect(report).toMatchObject({
    documentsTotal: 1,
    documentsChanged: 1,
    documentsRemoved: 0,
    chunksTotal: 2,
    chunksInserted: 2,
    chunksUpdated: 0,
    chunksDeleted: 0,
    embeddingInputs: 2,
  });
  const rows = await sql<
    {
      ordinal: number;
      heading_path: string[];
      anchor: string;
      content: string;
      token_count: number;
      dims: number;
    }[]
  >`SELECT ordinal,heading_path,anchor,content,token_count,vector_dims(embedding) AS dims FROM chunks ORDER BY ordinal`;
  expect(
    rows.map((row) => ({
      ordinal: row.ordinal,
      headingPath: row.heading_path,
      anchor: row.anchor,
      content: row.content,
      tokenCount: row.token_count,
    })),
  ).toEqual(doc.chunks);
  expect(rows.every((row) => row.dims === EMBEDDING.DIMENSIONS)).toBe(true);
  const [run] = await sql`SELECT * FROM ingest_runs ORDER BY id DESC LIMIT 1`;
  expect(run).toMatchObject({
    status: 'succeeded',
    documents_total: 1,
    chunks_inserted: 2,
    embedding_tokens: report.embeddingTokens,
    corpus_version: report.corpusVersion,
  });
  expect(run?.finished_at).toBeInstanceOf(Date);
  expect(Number(run?.cost_usd_estimate)).toBeCloseTo(report.costUsdEstimate, 6);
  expect(formatIngestReport(report, new Date('2026-10-21T00:00:00Z'))).toContain(
    '2 inserted   0 updated   0 unchanged   0 deleted',
  );
});

test('TC-048: IT-04 load failure records a failed run without a stack', async () => {
  const sql = getSql();
  await expect(
    ingestCorpus({
      sql,
      loadDocuments: () => Promise.reject(new Error('private failure details')),
      provider: mockProvider,
      embeddingModel: EMBEDDING.MOCK_MODEL,
      includeFixtures: false,
      pricePerMillion: 0,
    }),
  ).rejects.toThrow('private failure details');
  const [run] =
    await sql`SELECT status,error,finished_at FROM ingest_runs ORDER BY id DESC LIMIT 1`;
  expect(run).toMatchObject({ status: 'failed', error: 'Ingestion failed.' });
  expect(run?.finished_at).toBeInstanceOf(Date);
});

test('TC-048: IT-04 a failed document transaction rolls back document and chunks', async () => {
  const sql = getSql();
  const doc = ingestDocument('rollback.html', ['Valid content for a failing transaction.']);
  doc.chunks[0]!.headingPath = [];
  await expect(
    ingestCorpus({
      sql,
      loadDocuments: () => Promise.resolve([doc]),
      provider: mockProvider,
      embeddingModel: EMBEDDING.MOCK_MODEL,
      includeFixtures: false,
      pricePerMillion: 0,
    }),
  ).rejects.toMatchObject({ code: '23514' });
  expect(await sql`SELECT id FROM documents WHERE slug=${doc.slug}`).toHaveLength(0);
  const [run] = await sql`SELECT status FROM ingest_runs ORDER BY id DESC LIMIT 1`;
  expect(run?.status).toBe('failed');
});

test('TC-045: IT-04 ingests the three prescribed HTML fixtures with section provenance', async () => {
  const manifest = await loadManifest();
  const slugs = ['indexes-partial.html', 'transaction-iso.html', 'datatype-json.html'];
  const documents: IngestDocument[] = [];
  for (const slug of slugs) {
    const raw = await readFile(`tests/fixtures/html/${slug}`, 'utf8');
    const parsed = parseHtml(raw, {
      slug,
      section: 'test',
      contentSelector: manifest.contentSelector,
      removeSelectors: manifest.removeSelectors,
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
  const report = await ingestCorpus({
    sql: getSql(),
    loadDocuments: () => Promise.resolve(documents),
    provider: mockProvider,
    embeddingModel: EMBEDDING.MOCK_MODEL,
    includeFixtures: false,
    pricePerMillion: 0,
  });
  const rows = await getSql()<
    { slug: string; anchor: string; heading_path: string[] }[]
  >`SELECT d.slug,c.anchor,c.heading_path FROM chunks c JOIN documents d ON d.id=c.document_id ORDER BY d.slug,c.ordinal`;
  expect(report.documentsTotal).toBe(3);
  expect(report.chunksTotal).toBe(rows.length);
  expect(new Set(rows.map((row) => row.slug))).toEqual(new Set(slugs));
  for (const row of rows) {
    expect(row.anchor.startsWith(`${row.slug}#`)).toBe(true);
    expect(row.heading_path[0]).toBe(documents.find((doc) => doc.slug === row.slug)?.title);
    expect(row.heading_path.every((heading) => heading.length > 0)).toBe(true);
  }
  expect(rows.some((row) => row.anchor.includes('INDEXES-PARTIAL'))).toBe(true);
  expect(rows.some((row) => row.anchor.includes('XACT'))).toBe(true);
  expect(rows.some((row) => row.anchor.includes('DATATYPE-JSON'))).toBe(true);
});
