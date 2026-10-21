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
  const rows = await search(searchQueryVector, 'partial index predicate');
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
  const rows = await search(searchQueryVector, 'partial index predicate', {
    vectorCandidates: 2,
    ftsCandidates: 2,
  });
  expect(labels(rows.map((row) => row.chunkId))).toEqual(['A', 'D', 'B', 'F']);
  expect(await search(searchQueryVector, 'partial index predicate', { limit: 2 })).toHaveLength(2);
});

test('TC-050: IT-01 empty FTS gives vector order; ef_search is set in the same transaction', async () => {
  await getSql().begin(async (tx) => {
    const rows = await searchInTransaction(tx, searchQueryVector, 'the and of');
    expect(labels(rows.map((row) => row.chunkId))).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    expect(rows.every((row) => row.ftsRank === null)).toBe(true);
    const [setting] = await tx<
      { hnsw_ef_search: string }[]
    >`SELECT current_setting('hnsw.ef_search') AS hnsw_ef_search`;
    expect(Number(setting?.hnsw_ef_search)).toBe(RETRIEVAL.HNSW_EF_SEARCH);
  });
});
