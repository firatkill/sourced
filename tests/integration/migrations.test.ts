import { expect, test } from 'vitest';
import { EMBEDDING } from '@/lib/config';
import { getSql } from '@/lib/db/client';

const vector = JSON.stringify(
  Array.from({ length: EMBEDDING.DIMENSIONS }, (_, i) => (i === 0 ? 1 : 0)),
);

test('TC-025: IT-03 core tables and prescribed indexes exist', async () => {
  const sql = getSql();
  const tables = await sql<
    { tablename: string }[]
  >`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
  expect(tables.map((row) => row.tablename)).toEqual(
    expect.arrayContaining(['documents', 'chunks', 'ingest_runs']),
  );
  const indexes = await sql<
    { indexname: string; indexdef: string }[]
  >`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'`;
  const hnsw = indexes.find((row) => row.indexname === 'chunks_embedding_hnsw_idx')?.indexdef;
  expect(hnsw).toContain('USING hnsw');
  expect(hnsw).toContain('vector_cosine_ops');
  expect(hnsw).toMatch(/m='16'/);
  expect(hnsw).toMatch(/ef_construction='64'/);
  expect(indexes.find((row) => row.indexname === 'chunks_tsv_gin_idx')?.indexdef).toContain(
    'USING gin (tsv)',
  );
  for (const name of ['chunks_document_id_idx', 'chunks_anchor_idx', 'ingest_runs_finished_idx']) {
    expect(indexes.some((row) => row.indexname === name)).toBe(true);
  }
  expect(indexes.find((row) => row.indexname === 'ingest_runs_finished_idx')?.indexdef).toContain(
    'finished_at DESC',
  );
  const columns = await sql<
    {
      column_name: string;
      udt_name: string;
      is_identity: string;
      identity_generation: string | null;
    }[]
  >`
    SELECT column_name, udt_name, is_identity, identity_generation FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chunks'`;
  expect(columns.find((row) => row.column_name === 'embedding')?.udt_name).toBe('vector');
  expect(columns.find((row) => row.column_name === 'id')).toMatchObject({
    is_identity: 'YES',
    identity_generation: 'ALWAYS',
    udt_name: 'int8',
  });
});

test('TC-026: IT-03 tsv is generated from content and changes with it', async () => {
  const sql = getSql();
  const [doc] = await sql<
    { id: bigint }[]
  >`INSERT INTO documents (slug,url,title,version,section,content_hash,fetched_at)
    VALUES ('tsv.html','https://example.test/tsv','HeadingOnlyToken','17','indexes',${'a'.repeat(64)},now()) RETURNING id`;
  expect(doc).toBeDefined();
  const [chunk] = await sql<
    { id: bigint; tsv: string }[]
  >`INSERT INTO chunks (document_id,ordinal,heading_path,anchor,content,token_count,content_hash,embedding_model,embedding)
    VALUES (${doc!.id.toString()},0,ARRAY['HeadingOnlyToken'],'tsv.html#TEST','Partial indexes improve queries.',5,${'b'.repeat(64)},'mock-feature-hash',${vector}::vector) RETURNING id,tsv::text`;
  expect(chunk?.tsv).toContain("'index'");
  expect(chunk?.tsv).not.toContain('headingonlytoken');
  const [updated] = await sql<
    { matches: boolean }[]
  >`UPDATE chunks SET content='Transactions isolate changes.' WHERE id=${chunk!.id.toString()} RETURNING tsv @@ to_tsquery('english','transaction') AS matches`;
  expect(updated?.matches).toBe(true);
  const [generated] = await sql<
    { is_generated: string }[]
  >`SELECT is_generated FROM information_schema.columns WHERE table_schema='public' AND table_name='chunks' AND column_name='tsv'`;
  expect(generated?.is_generated).toBe('ALWAYS');
});

test('TC-027: IT-03 core checks, deferred ordinal uniqueness and cascading deletion', async () => {
  const sql = getSql();
  await expect(
    sql`INSERT INTO documents (slug,url,title,version,section,content_hash,fetched_at) VALUES ('bad','bad','bad','17','indexes','bad',now())`,
  ).rejects.toMatchObject({ code: '23514' });
  const [doc] = await sql<
    { id: bigint }[]
  >`INSERT INTO documents (slug,url,title,version,section,content_hash,fetched_at) VALUES ('checks.html','https://example.test/checks','Checks','17','indexes',${'c'.repeat(64)},now()) RETURNING id`;
  expect(doc).toBeDefined();
  for (const bad of [
    { ordinal: -1, path: ['Checks'], content: 'Content', tokens: 1 },
    { ordinal: 0, path: [], content: 'Content', tokens: 1 },
    { ordinal: 0, path: ['Checks'], content: '', tokens: 1 },
    { ordinal: 0, path: ['Checks'], content: 'Content', tokens: 0 },
  ]) {
    await expect(sql`INSERT INTO chunks (document_id,ordinal,heading_path,anchor,content,token_count,content_hash,embedding_model,embedding)
      VALUES (${doc!.id.toString()},${bad.ordinal},${sql.array(bad.path)},'checks.html#CHECKS',${bad.content},${bad.tokens},${'d'.repeat(64)},'mock-feature-hash',${vector}::vector)`).rejects.toMatchObject(
      { code: '23514' },
    );
  }
  await expect(
    sql`INSERT INTO ingest_runs (status,include_fixtures,embedding_model) VALUES ('invalid',false,'mock-feature-hash')`,
  ).rejects.toMatchObject({ code: '23514' });
  await sql`INSERT INTO chunks (document_id,ordinal,heading_path,anchor,content,token_count,content_hash,embedding_model,embedding)
    VALUES (${doc!.id.toString()},0,ARRAY['Checks'],'checks.html#CHECKS','First',1,${'e'.repeat(64)},'mock-feature-hash',${vector}::vector),
           (${doc!.id.toString()},1,ARRAY['Checks'],'checks.html#CHECKS','Second',1,${'f'.repeat(64)},'mock-feature-hash',${vector}::vector)`;
  const [constraint] = await sql<
    { condeferrable: boolean; condeferred: boolean }[]
  >`SELECT condeferrable,condeferred FROM pg_constraint WHERE conname='chunks_document_ordinal_key'`;
  expect(constraint).toMatchObject({ condeferrable: true, condeferred: true });
  await sql.begin(async (tx) => {
    await tx`UPDATE chunks SET ordinal=1 WHERE content_hash=${'e'.repeat(64)}`;
    await tx`UPDATE chunks SET ordinal=0 WHERE content_hash=${'f'.repeat(64)}`;
  });
  await expect(
    sql`UPDATE chunks SET ordinal=0 WHERE document_id=${doc!.id.toString()}`,
  ).rejects.toMatchObject({ code: '23505' });
  await sql`DELETE FROM documents WHERE id=${doc!.id.toString()}`;
  const [remaining] = await sql<
    { count: number }[]
  >`SELECT count(*)::int AS count FROM chunks WHERE document_id=${doc!.id.toString()}`;
  expect(remaining?.count).toBe(0);
});
