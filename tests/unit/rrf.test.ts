import { expect, test } from 'vitest';
import { RETRIEVAL } from '@/lib/config';
import { rrfMerge } from '@/lib/retrieval/rrf';

test('TC-049: UT-05 normative fused ranking, scores and limits', () => {
  const rows = rrfMerge(['1', '2', '3', '4', '5', '6'], ['4', '6', '1'], RETRIEVAL.RRF_K, 20);
  expect(rows.map((row) => row.id)).toEqual(['1', '4', '6', '2', '3', '5']);
  expect(rows[0]).toEqual({ id: '1', vectorRank: 1, ftsRank: 3, score: 1 / 61 + 1 / 63 });
  expect(rrfMerge(['1', '2'], ['4', '6'], RETRIEVAL.RRF_K, 20).map((row) => row.id)).toEqual([
    '1',
    '4',
    '2',
    '6',
  ]);
  expect(rrfMerge(['1', '2'], [], RETRIEVAL.RRF_K, 1)).toEqual([
    { id: '1', score: 1 / 61, vectorRank: 1, ftsRank: null },
  ]);
  expect(rrfMerge([], ['2'], RETRIEVAL.RRF_K, 1)).toEqual([
    { id: '2', score: 1 / 61, vectorRank: null, ftsRank: 1 },
  ]);
  expect(rrfMerge([], [], RETRIEVAL.RRF_K, 20)).toEqual([]);
});

test('TC-049: UT-05 tied scores use numeric bigint identity, not string or float ordering', () => {
  expect(rrfMerge(['10'], ['2'], RETRIEVAL.RRF_K, 20).map((row) => row.id)).toEqual(['2', '10']);
  expect(
    rrfMerge(['9007199254740993'], ['9007199254740992'], RETRIEVAL.RRF_K, 20).map((row) => row.id),
  ).toEqual(['9007199254740992', '9007199254740993']);
});
