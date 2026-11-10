// TC-179, TC-192 / IT-13 / FR-62 / T-52. Dedicated corpus DB, never getSql().
import { afterAll, beforeAll, expect, test } from 'vitest';
import postgres from 'postgres';
import { createMockProvider } from '@/lib/llm/mock';
import { corpusSchema } from '@/lib/kit/vector-schema';
import { searchInTransaction } from '@/lib/retrieval/search';
import {
  fixtureDatabaseUrl,
  mockFixtureConfig,
  setupFixtureDatabase,
} from '../fixtures/kit-tr/database';

const url = fixtureDatabaseUrl(process.env.TEST_DATABASE_URL);
const sql = postgres(url, { max: 1, prepare: false });
const config = mockFixtureConfig();
beforeAll(async () => {
  const report = await setupFixtureDatabase(url);
  expect(report.documentsTotal).toBe(4);
  expect(report.chunksTotal).toBeGreaterThanOrEqual(4);
  expect(report.costUsdEstimate).toBe(0);
});
afterAll(async () => {
  await sql.end();
});

test('TC-179 / IT-13: real Turkish folder passages have keyword hits that English misses', async () => {
  const [database] = await sql<{ name: string }[]>`SELECT current_database() AS name`;
  expect(database?.name).toBe('sourced_kit_tr');
  const [meta] = await sql`SELECT corpus_name, fts_config::text, documents_total FROM corpus_meta`;
  expect(meta).toMatchObject({ corpus_name: 'kit-tr', fts_config: 'turkish', documents_total: 4 });
  const { vectors } = await createMockProvider(config.models.embed.dimensions).embed([
    'saksılarınızın',
  ]);
  const vector = vectors[0]!;
  await sql.begin(async (tx) => {
    const schema = corpusSchema(config);
    const turkish = await searchInTransaction(tx, vector, 'saksılarınızın', {}, schema);
    const english = await searchInTransaction(
      tx,
      vector,
      'saksılarınızın',
      {},
      { ...schema, fts_config: 'english' },
    );
    expect(turkish.ftsCandidates).toBeGreaterThan(0);
    expect(
      turkish.chunks.filter((chunk) => chunk.ftsRank !== null).map((chunk) => chunk.slug),
    ).toContain('saksilar.md');
    expect(english.ftsCandidates).toBe(0);
    // Also compare complete English indexing/querying with Turkish, not vector fallback.
    const [comparison] = await tx<{ turkish: boolean; english: boolean }[]>`
      SELECT bool_or(to_tsvector('turkish', content) @@ websearch_to_tsquery('turkish', 'etiket')) AS turkish,
             bool_or(to_tsvector('english', content) @@ websearch_to_tsquery('english', 'etiket')) AS english
      FROM chunks WHERE document_id IN (SELECT id FROM documents WHERE slug='saksilar.md')`;
    expect(comparison).toEqual({ turkish: true, english: false });
  });
});
