import { expect, test } from 'vitest';
import { getSql } from '@/lib/db/client';
import { RETRIEVAL } from '@/lib/config';
import { featureHash } from '@/lib/llm/feature-hash';
import { search } from '@/lib/retrieval/search';
import { rrfMerge } from '@/lib/retrieval/rrf';
import { insertSearchChunks } from '../helpers/search';

test('TC-051: IT-02 SQL equals reference for 200 deterministic random chunks and 20 queries', async () => {
  let state = 42;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  const vocabulary = [
    'partial',
    'index',
    'predicate',
    'transaction',
    'isolation',
    'json',
    'backup',
    'vacuum',
    'table',
    'row',
    'lock',
    'query',
    'schema',
    'constraint',
    'policy',
    'recovery',
  ];
  const words = (length: number) =>
    Array.from({ length }, () => vocabulary[Math.floor(random() * vocabulary.length)]).join(' ');
  const data = Array.from({ length: 200 }, (_, index) => {
    const content = `${words(30)} document_${String(index)}`;
    return { content, vector: featureHash(content).vector };
  });
  const sql = getSql();
  await insertSearchChunks(sql, 'random.html', data);
  for (let index = 0; index < 20; index++) {
    const question = words(3);
    const vector = featureHash(question).vector;
    const vectorRows = await sql<
      { id: string }[]
    >`SELECT id::text FROM (SELECT id,embedding <=> ${JSON.stringify(vector)}::vector AS distance FROM chunks ORDER BY embedding <=> ${JSON.stringify(vector)}::vector LIMIT ${RETRIEVAL.VECTOR_CANDIDATES}) v ORDER BY distance,v.id`;
    const ftsRows = await sql<
      { id: string }[]
    >`SELECT id::text FROM chunks,websearch_to_tsquery('english',${question}) q(query) WHERE tsv @@ q.query ORDER BY ts_rank_cd(tsv,q.query,32) DESC,chunks.id LIMIT ${RETRIEVAL.FTS_CANDIDATES}`;
    const expected = rrfMerge(
      vectorRows.map((row) => row.id),
      ftsRows.map((row) => row.id),
      RETRIEVAL.RRF_K,
      RETRIEVAL.RERANK_CANDIDATES,
    );
    const actual = await search(vector, question);
    expect(actual.map((row) => row.chunkId)).toEqual(expected.map((row) => row.id));
    for (const [position, row] of actual.entries()) {
      expect(row.rrfScore).toBeCloseTo(expected[position]!.score, 12);
      expect(row.vectorRank).toBe(expected[position]!.vectorRank);
      expect(row.ftsRank).toBe(expected[position]!.ftsRank);
    }
  }
  await sql.begin(async (tx) => {
    await tx`SET LOCAL enable_seqscan = off`;
    const plan =
      await tx`EXPLAIN (ANALYZE, BUFFERS) SELECT id FROM chunks ORDER BY embedding <=> ${JSON.stringify(data[0]!.vector)}::vector LIMIT ${RETRIEVAL.VECTOR_CANDIDATES}`;
    expect(JSON.stringify(plan)).toContain('chunks_embedding_hnsw_idx');
  });
});
