import { randomUUID } from 'node:crypto';
import { answerQuestion } from '@/lib/generation/answer';
import type { SseEvent } from '@/lib/sse/events';
import { beforeAll, expect, test } from 'vitest';
import { getSql } from '@/lib/db/client';
import { RETRIEVAL } from '@/lib/config';
import { search, searchInTransaction } from '@/lib/retrieval/search';
import { searchFixture, searchQueryVector } from '../fixtures/search-fixture';
import { insertSearchChunks } from '../helpers/search';
let ids: string[];
beforeAll(async () => {
  ids = await insertSearchChunks(getSql(), 'rank.html', searchFixture);
});
const labels = (values: string[]) => values.map((id) => searchFixture[ids.indexOf(id)]?.label);

test('TC-050: IT-01 FTS ranks D/F/A and hybrid fusion matches the normative order', async () => {
  const fts = await getSql()<
    { id: string }[]
  >`SELECT id::text FROM chunks, websearch_to_tsquery('english','partial index predicate') AS q(query) WHERE tsv @@ q.query ORDER BY ts_rank_cd(tsv,q.query,32) DESC,id ASC`;
  expect(labels(fts.map((row) => row.id))).toEqual(['D', 'F', 'A']);
  const {
    chunks: rows,
    vectorCandidates,
    ftsCandidates,
  } = await search(searchQueryVector, 'partial index predicate');
  expect(vectorCandidates).toBe(6);
  expect(ftsCandidates).toBe(3);
  expect(labels(rows.map((row) => row.chunkId))).toEqual(['A', 'D', 'F', 'B', 'C', 'E']);
  expect(rows[0]?.rrfScore).toBeCloseTo(1 / 61 + 1 / 63, 12);
  expect(rows[0]).toMatchObject({
    vectorRank: 1,
    ftsRank: 3,
    documentTitle: 'Search fixture',
    slug: 'rank.html',
  });
});

test('TC-050: IT-01 candidate limits and bigint tie-break give A/D/B/F', async () => {
  const {
    chunks: rows,
    vectorCandidates,
    ftsCandidates,
  } = await search(searchQueryVector, 'partial index predicate', {
    vectorCandidates: 2,
    ftsCandidates: 2,
  });
  expect(vectorCandidates).toBe(2);
  expect(ftsCandidates).toBe(2);
  expect(labels(rows.map((row) => row.chunkId))).toEqual(['A', 'D', 'B', 'F']);
  expect(
    (await search(searchQueryVector, 'partial index predicate', { limit: 2 })).chunks,
  ).toHaveLength(2);
});

test('TC-050: IT-01 empty FTS gives vector order; ef_search is set in the same transaction', async () => {
  await getSql().begin(async (tx) => {
    const {
      chunks: rows,
      vectorCandidates,
      ftsCandidates,
    } = await searchInTransaction(tx, searchQueryVector, 'the and of');
    expect(vectorCandidates).toBe(6);
    expect(ftsCandidates).toBe(0);
    expect(labels(rows.map((row) => row.chunkId))).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    expect(rows.every((row) => row.ftsRank === null)).toBe(true);
    const [setting] = await tx<
      { hnsw_ef_search: string }[]
    >`SELECT current_setting('hnsw.ef_search') AS hnsw_ef_search`;
    expect(Number(setting?.hnsw_ef_search)).toBe(RETRIEVAL.HNSW_EF_SEARCH);
  });
});

test('TC-050 / TC-074: D-76 meta reports 40 vector and 17 FTS candidates before fusion', async () => {
  const sql = getSql();
  await insertSearchChunks(
    sql,
    'candidate-counts.html',
    Array.from({ length: 50 }, (_, index) => ({
      content:
        index < 14
          ? 'A partial index predicate selects relevant rows.'
          : 'Transactions isolate concurrent changes in the database.',
      vector: searchQueryVector,
    })),
  );
  try {
    const events: SseEvent[] = [];
    const result = await answerQuestion({
      question: 'partial index predicate',
      requestId: randomUUID(),
      signal: new AbortController().signal,
      emit: (event) => events.push(event),
    });
    expect(result.candidates).toHaveLength(RETRIEVAL.RERANK_CANDIDATES);
    expect(result.retrieval.vectorCandidates).toBe(40);
    expect(result.retrieval.ftsCandidates).toBe(17);
    const meta = events.find((event) => event.event === 'meta');
    expect(meta?.data.retrieval).toMatchObject({ vectorCandidates: 40, ftsCandidates: 17 });
  } finally {
    await sql`DELETE FROM documents WHERE slug = 'candidate-counts.html'`;
  }
});
