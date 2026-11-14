import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { requireLocalDatabase } from '../helpers/local-database';
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

test('TC-029: IT-03 all tables, primary keys and operational constraints match the DDL', async () => {
  const sql = getSql();
  const keys = await sql<{ name: string; columns: string[] }[]>`
    SELECT t.relname AS name, array_agg(a.attname ORDER BY k.ordinality) AS columns
    FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=t.relnamespace
    CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY k(attnum,ordinality)
    JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=k.attnum
    WHERE c.contype='p' AND n.nspname='public' GROUP BY t.relname`;
  expect(Object.fromEntries(keys.map((row) => [row.name, row.columns]))).toEqual({
    corpus_meta: ['id'],
    ingest_items: ['run_id', 'document_key'],
    documents: ['id'],
    chunks: ['id'],
    ingest_runs: ['id'],
    answer_cache: ['id'],
    rate_limits: ['bucket', 'window_start'],
    query_log: ['id'],
  });
  const checks = await sql<
    { conname: string }[]
  >`SELECT conname FROM pg_constraint WHERE contype='c' AND connamespace='public'::regnamespace`;
  expect(checks.map((row) => row.conname)).toEqual(
    expect.arrayContaining([
      'documents_content_hash_hex',
      'chunks_ordinal_check',
      'chunks_heading_path_check',
      'chunks_content_check',
      'chunks_token_count_check',
      'ingest_runs_status_check',
      'rate_limits_count_check',
      'query_log_source_check',
      'query_log_outcome_check',
      'query_log_question_length_check',
    ]),
  );
  const indexes = await sql<
    { indexname: string; indexdef: string }[]
  >`SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public'`;
  expect(indexes.find((row) => row.indexname === 'answer_cache_suggested_idx')?.indexdef).toContain(
    '(suggested_id, created_at DESC)',
  );
  expect(indexes.find((row) => row.indexname === 'rate_limits_window_idx')?.indexdef).toContain(
    '(window_start)',
  );
  expect(indexes.find((row) => row.indexname === 'query_log_created_at_idx')?.indexdef).toContain(
    '(created_at DESC)',
  );
  await expect(
    sql`INSERT INTO rate_limits (bucket,window_start,count) VALUES ('global',current_date,-1)`,
  ).rejects.toMatchObject({ code: '23514' });
  for (const bad of [
    { source: 'invalid', outcome: 'answered', length: 1 },
    { source: 'live', outcome: 'invalid', length: 1 },
    { source: 'live', outcome: 'answered', length: -1 },
  ]) {
    await expect(
      sql`INSERT INTO query_log (request_id,source,outcome,question_hash,question_length) VALUES ('00000000-0000-4000-8000-000000000001',${bad.source},${bad.outcome},'hash',${bad.length})`,
    ).rejects.toMatchObject({ code: '23514' });
  }
  await sql`INSERT INTO answer_cache (cache_key,suggested_id,question,corpus_version,prompt_version,chat_model,payload) VALUES ('key','id','Question','corpus','prompt','mock','{}'::jsonb)`;
  await expect(
    sql`INSERT INTO answer_cache (cache_key,suggested_id,question,corpus_version,prompt_version,chat_model,payload) VALUES ('key','id','Question','corpus','prompt','mock','{}'::jsonb)`,
  ).rejects.toMatchObject({ code: '23505' });
  await sql`INSERT INTO query_log (request_id,source,outcome,question_hash,question_length) VALUES ('00000000-0000-4000-8000-000000000001','cache','answered','hash',0)`;
  await expect(
    sql`INSERT INTO query_log (request_id,source,outcome,question_hash,question_length) VALUES ('00000000-0000-4000-8000-000000000001','live','error','hash',0)`,
  ).rejects.toMatchObject({ code: '23505' });
});

// T-46 / FR-61, FR-67, FR-72 / TRD §30.1: run the actual journal on isolated databases.
test.each(['empty', 'v1'] as const)(
  'TC-174: migration 0003 applies to a %s database',
  async (state) => {
    const url = requireLocalDatabase(process.env.TEST_DATABASE_URL);
    const admin = postgres(url, { max: 1, prepare: false });
    const name = `migration_${randomUUID().replaceAll('-', '')}`;
    const folder = await mkdtemp(join(tmpdir(), 'sourced-migrations-'));
    let database: postgres.Sql | undefined;
    let created = false;
    try {
      await admin`CREATE DATABASE ${admin(name)}`;
      created = true;
      const target = new URL(url);
      target.pathname = `/${name}`;
      database = postgres(target.toString(), { max: 1, prepare: false });
      const sql = database;
      const db = drizzle(sql);
      let before: unknown;
      if (state === 'v1') {
        const journal = JSON.parse(await readFile('drizzle/meta/_journal.json', 'utf8')) as {
          entries: { tag: string }[];
        };
        journal.entries = journal.entries.slice(0, 3);
        await mkdir(join(folder, 'meta'));
        await writeFile(join(folder, 'meta/_journal.json'), JSON.stringify(journal));
        for (const entry of journal.entries) {
          await copyFile(`drizzle/${entry.tag}.sql`, join(folder, `${entry.tag}.sql`));
        }
        await migrate(db, { migrationsFolder: folder });
        await sql`INSERT INTO documents (slug,url,title,version,section,content_hash,fetched_at)
        VALUES ('v1.html','https://example.test/v1','V1 document','17','indexes',${'a'.repeat(64)},now())`;
        await sql`INSERT INTO chunks (document_id,ordinal,heading_path,anchor,content,token_count,content_hash,embedding_model,embedding)
        SELECT id,0,ARRAY['V1'],'v1.html#ROOT','Partial indexes improve queries.',5,${'b'.repeat(64)},'mock-feature-hash',${vector}::vector FROM documents`;
        await sql`INSERT INTO ingest_runs (status,include_fixtures,embedding_model) VALUES ('succeeded',false,'mock-feature-hash')`;
        await sql`INSERT INTO answer_cache (cache_key,suggested_id,question,corpus_version,prompt_version,chat_model,payload)
        VALUES ('v1','v1','Question','corpus','prompt','mock','{}')`;
        await sql`INSERT INTO rate_limits (bucket,window_start,count) VALUES ('global',current_date,1)`;
        await sql`INSERT INTO query_log (request_id,source,outcome,question_hash,question_length)
        VALUES (${randomUUID()},'live','answered','hash',1)`;
        before = await sql`SELECT to_jsonb(d) AS document, to_jsonb(c) AS chunk, to_jsonb(r) AS run,
        to_jsonb(a) AS cache, to_jsonb(l) AS limits, to_jsonb(q) AS query
        FROM documents d, chunks c, ingest_runs r, answer_cache a, rate_limits l, query_log q`;
        const old = await sql`SELECT 1 FROM pg_constraint WHERE conname='chunks_content_hash_key'`;
        expect(old).toHaveLength(1);
      }
      await migrate(db, { migrationsFolder: './drizzle' });
      if (state === 'v1') {
        expect(
          await sql`SELECT to_jsonb(d) - ARRAY['source_id','source_kind','mime_type'] AS document,
        to_jsonb(c) - ARRAY['page_from','page_to','embed_text_version'] AS chunk,
        to_jsonb(r) - 'config_hash' AS run, to_jsonb(a) AS cache, to_jsonb(l) AS limits, to_jsonb(q) AS query
        FROM documents d, chunks c, ingest_runs r, answer_cache a, rate_limits l, query_log q`,
        ).toEqual(before);
        expect(
          (
            await sql`SELECT source_id,source_kind,mime_type,page_from,page_to,embed_text_version,config_hash
        FROM documents, chunks, ingest_runs`
          )[0],
        ).toEqual({
          source_id: null,
          source_kind: null,
          mime_type: null,
          page_from: null,
          page_to: null,
          embed_text_version: 0,
          config_hash: null,
        });
      }
      const constraints = await sql<{ conname: string; definition: string }[]>`
      SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='chunks'::regclass`;
      expect(
        constraints.find((row) => row.conname === 'chunks_document_content_hash_key')?.definition,
      ).toBe('UNIQUE (document_id, content_hash)');
      expect(constraints.some((row) => row.conname === 'chunks_content_hash_key')).toBe(false);
      expect(await sql`SELECT 1 FROM corpus_meta`).toHaveLength(0);
      expect(await sql`SELECT 1 FROM ingest_items`).toHaveLength(0);
      const columns = await sql<{ table_name: string; column_name: string; udt_name: string }[]>`
      SELECT table_name,column_name,udt_name FROM information_schema.columns WHERE table_schema='public'`;
      for (const [table, column, type] of [
        ['corpus_meta', 'fts_config', 'regconfig'],
        ['documents', 'source_id', 'text'],
        ['documents', 'source_kind', 'text'],
        ['documents', 'mime_type', 'text'],
        ['chunks', 'page_from', 'int4'],
        ['chunks', 'page_to', 'int4'],
        ['chunks', 'embed_text_version', 'int2'],
        ['ingest_runs', 'config_hash', 'text'],
      ]) {
        expect(
          columns.find((row) => row.table_name === table && row.column_name === column)?.udt_name,
        ).toBe(type);
      }
      const cli =
        await sql`INSERT INTO query_log (request_id,source,outcome,question_hash,question_length)
      VALUES (${randomUUID()},'cli','answered','hash',1) RETURNING source`;
      expect(cli[0]?.source).toBe('cli');
    } finally {
      await database?.end();
      if (created) await admin`DROP DATABASE ${admin(name)}`;
      await admin.end();
      await rm(folder, { recursive: true, force: true });
    }
  },
);
