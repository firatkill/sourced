import { expect, test } from 'vitest';
import { featureHash } from '@/lib/llm/feature-hash';
import { mockProvider } from '@/lib/llm/mock';
import { EMBEDDING } from '@/lib/config';

const cosine = (a: number[], b: number[]) =>
  a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0);
test('TC-042: UT-27 feature hashing is deterministic, normalized and text-sensitive', async () => {
  const a = featureHash('PostgreSQL partial index predicate');
  expect(a).toEqual(featureHash('POSTGRESQL, partial index predicate!'));
  expect(a.vector).toHaveLength(EMBEDDING.DIMENSIONS);
  expect(Math.hypot(...a.vector)).toBeCloseTo(1, 12);
  expect(a.tokens).toBe(4);
  expect(cosine(a.vector, featureHash('partial index predicate').vector)).toBeGreaterThan(
    cosine(a.vector, featureHash('wal backup recovery').vector),
  );
  expect(featureHash('!!!')).toEqual({
    vector: [1, ...Array<number>(EMBEDDING.DIMENSIONS - 1).fill(0)],
    tokens: 0,
  });
  expect(featureHash('one two').vector).not.toEqual(featureHash('two one').vector);
  expect(await mockProvider.embed(['one two', 'three'])).toEqual({
    vectors: [featureHash('one two').vector, featureHash('three').vector],
    tokens: 3,
  });
  expect(await mockProvider.embed([])).toEqual({ vectors: [], tokens: 0 });
});
