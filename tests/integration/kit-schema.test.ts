// IT-12, IT-13 / FR-61, FR-62 / D-96. Integration DB only (suite setup enforces localhost).
import { afterAll, beforeEach, expect, test } from 'vitest';
import { getSql } from '@/lib/db/client';
import { getKitConfig } from '@/lib/kit/runtime-config';
import {
  checkAppCorpusSchema,
  checkCorpusSchema,
  corpusSchema,
  ensureCorpusSchema,
} from '@/lib/kit/vector-schema';
import { searchInTransaction } from '@/lib/retrieval/search';
import { insertSearchChunks } from '../helpers/search';

const sql = getSql();
const configFor = (dimensions = 1536, language = 'en') => {
  const config = getKitConfig();
  config.models.embed.dimensions = dimensions;
  config.corpus.language = language;
  return config;
};
const vector = (n: number) => [1, ...Array<number>(n - 1).fill(0)];
beforeEach(async () => {
  await sql`TRUNCATE chunks, documents CASCADE`;
  await sql`DELETE FROM corpus_meta`;
});
afterAll(async () => {
  await ensureCorpusSchema(sql, configFor(), { rebuild: true, confirmed: true });
  await sql`DELETE FROM corpus_meta`;
});
test.each([
  [768, 'vector'],
  [3072, 'halfvec'],
] as const)(
  'IT-12: fresh %i dimensions uses %s and no-ops on same hash',
  async (dimensions, type) => {
    const config = configFor(dimensions);
    await ensureCorpusSchema(sql, config);
    const [column] = await sql<
      { type: string }[]
    >`SELECT format_type(atttypid,atttypmod) AS type FROM pg_attribute WHERE attrelid='chunks'::regclass AND attname='embedding'`;
    expect(column?.type).toBe(`${type}(${String(dimensions)})`);
    const [index] = await sql<
      { indexdef: string }[]
    >`SELECT indexdef FROM pg_indexes WHERE indexname='chunks_embedding_hnsw_idx'`;
    expect(index?.indexdef).toContain(`${type}_cosine_ops`);
    const before = await sql`SELECT * FROM corpus_meta`;
    await ensureCorpusSchema(sql, config);
    expect(await sql`SELECT * FROM corpus_meta`).toEqual(before);
    await insertSearchChunks(sql, 'protected', [
      { content: 'Existing indexed content.', vector: vector(dimensions) },
    ]);
    const stored = await sql`SELECT * FROM corpus_meta`;
    const chunks = await sql`SELECT * FROM chunks`;
    await expect(
      ensureCorpusSchema(sql, configFor(dimensions === 768 ? 3072 : 768)),
    ).rejects.toMatchObject({ code: 'CORPUS_MISMATCH' });
    expect(await sql`SELECT * FROM corpus_meta`).toEqual(stored);
    expect(await sql`SELECT * FROM chunks`).toEqual(chunks);
  },
);
test('IT-12: rebuild requires explicit confirmation and replaces the schema', async () => {
  await ensureCorpusSchema(sql, configFor());
  await insertSearchChunks(sql, 'rebuild', [
    { content: 'A document to rebuild.', vector: vector(1536) },
  ]);
  await expect(ensureCorpusSchema(sql, configFor(768), { rebuild: true })).rejects.toMatchObject({
    code: 'CONFIG_INVALID',
  });
  expect(await sql`SELECT id FROM chunks`).toHaveLength(1);
  await ensureCorpusSchema(sql, configFor(768), { rebuild: true, confirmed: true });
  expect(await sql`SELECT id FROM documents`).toHaveLength(0);
  expect((await checkCorpusSchema(sql, configFor(768))).initialized).toBe(true);
});
async function legacy() {
  const config = configFor();
  await ensureCorpusSchema(sql, config);
  await sql`DELETE FROM corpus_meta`;
  await insertSearchChunks(sql, 'legacy', [
    { content: 'Existing v1 corpus content.', vector: vector(1536) },
  ]);
  return config;
}
test('IT-12 / D-96: read-only v1 comparison and ingest adoption preserve every row', async () => {
  const config = await legacy();
  const firstCheck = checkAppCorpusSchema(sql, config);
  expect(checkAppCorpusSchema(sql, config)).toBe(firstCheck);
  await firstCheck;
  const documents = await sql`SELECT * FROM documents`;
  const chunks = await sql`SELECT * FROM chunks`;
  expect((await checkCorpusSchema(sql, config)).initialized).toBe(false);
  expect(await sql`SELECT * FROM corpus_meta`).toHaveLength(0);
  await ensureCorpusSchema(sql, config);
  expect(await sql`SELECT * FROM documents`).toEqual(documents);
  expect(await sql`SELECT * FROM chunks`).toEqual(chunks);
  expect(await sql`SELECT documents_total FROM corpus_meta`).toEqual([{ documents_total: 1 }]);
});
test.each(['model', 'language'] as const)(
  'IT-12 / D-96: v1 %s mismatch changes nothing',
  async (kind) => {
    const config = await legacy();
    if (kind === 'model') await sql`UPDATE chunks SET embedding_model='different-model'`;
    else {
      await sql`ALTER TABLE chunks DROP COLUMN tsv`;
      await sql`ALTER TABLE chunks ADD COLUMN tsv tsvector GENERATED ALWAYS AS (to_tsvector('turkish'::regconfig, content)) STORED`;
      await sql`CREATE INDEX chunks_tsv_gin_idx ON chunks USING gin(tsv)`;
    }
    await expect(checkCorpusSchema(sql, config)).rejects.toMatchObject({ code: 'CORPUS_MISMATCH' });
    await expect(ensureCorpusSchema(sql, config)).rejects.toMatchObject({
      code: 'CORPUS_MISMATCH',
    });
    expect(await sql`SELECT * FROM corpus_meta`).toHaveLength(0);
    expect(await sql`SELECT id FROM chunks`).toHaveLength(1);
  },
);
test('IT-13: Turkish stemming finds keyword hits missed by English', async () => {
  const config = configFor(768, 'tr');
  await ensureCorpusSchema(sql, config);
  await insertSearchChunks(sql, 'turkish', [{ content: 'Kitaplar masada.', vector: vector(768) }]);
  await sql.begin(async (tx) => {
    const turkish = await searchInTransaction(tx, vector(768), 'kitap', {}, corpusSchema(config));
    expect(turkish.ftsCandidates).toBe(1);
    expect(turkish.chunks[0]?.ftsRank).toBe(1);
    const english = await searchInTransaction(
      tx,
      vector(768),
      'kitap',
      {},
      { ...corpusSchema(config), fts_config: 'english' },
    );
    // English misses plural query morphology against the same Turkish index.
    const plural = await searchInTransaction(
      tx,
      vector(768),
      'kitaplar',
      {},
      { ...corpusSchema(config), fts_config: 'english' },
    );
    expect(english.ftsCandidates).toBe(1);
    expect(plural.ftsCandidates).toBe(0);
    expect(
      (await searchInTransaction(tx, vector(768), 'kitaplar', {}, corpusSchema(config)))
        .ftsCandidates,
    ).toBe(1);
  });
});
test('A-18: installed HNSW enforces vector 2000 and halfvec 4000 limits', async () => {
  const [extension] = await sql<
    { extversion: string }[]
  >`SELECT extversion FROM pg_extension WHERE extname='vector'`;
  expect(extension?.extversion).toBeTruthy();
  await expect(
    sql.begin(async (tx) => {
      await tx`CREATE TEMP TABLE vector_limit (embedding vector(2001)) ON COMMIT DROP`;
      await tx`CREATE INDEX ON vector_limit USING hnsw (embedding vector_cosine_ops)`;
    }),
  ).rejects.toThrow(/2000/);
  await expect(
    sql.begin(async (tx) => {
      await tx`CREATE TEMP TABLE halfvec_limit (embedding halfvec(4001)) ON COMMIT DROP`;
      await tx`CREATE INDEX ON halfvec_limit USING hnsw (embedding halfvec_cosine_ops)`;
    }),
  ).rejects.toThrow(/4000/);
  await sql.begin(async (tx) => {
    await tx`CREATE TEMP TABLE halfvec_supported (embedding halfvec(4000)) ON COMMIT DROP`;
    await tx`CREATE INDEX ON halfvec_supported USING hnsw (embedding halfvec_cosine_ops)`;
  });
});

test('IT-12 / D-120: empty initialized corpus adopts new provider, dimensions and language without rebuild', async () => {
  const initial = configFor(1536);
  initial.models.embed = { provider: 'openai', model: 'text-embedding-3-small', dimensions: 1536 };
  await ensureCorpusSchema(sql, initial);
  const next = configFor(768, 'tr');
  await ensureCorpusSchema(sql, next);
  expect((await checkCorpusSchema(sql, next)).schema).toEqual(corpusSchema(next));
  const [column] = await sql<
    { type: string }[]
  >`SELECT format_type(atttypid,atttypmod) AS type FROM pg_attribute WHERE attrelid='chunks'::regclass AND attname='embedding'`;
  expect(column?.type).toBe('vector(768)');
  expect(await sql`SELECT * FROM chunks`).toHaveLength(0);
  expect(await sql`SELECT * FROM corpus_meta`).toHaveLength(1);
});
