import { EMBEDDING } from '@/lib/config';
export const searchQueryVector = Array.from({ length: EMBEDDING.DIMENSIONS }, (_, index) =>
  index === 0 ? 1 : 0,
);
export const searchFixture = [
  'A partial condition selects relevant rows from a large table. An index speeds lookup of those rows. The predicate defines that condition.',
  'Transactions isolate concurrent changes.',
  'WAL records support recovery.',
  'partial index predicate. partial index predicate.',
  'JSON stores structured data.',
  'partial useful index with a predicate.',
].map((content, index) => {
  const rank = index + 1;
  const norm = Math.hypot(1, 0.2 * rank);
  return {
    label: String.fromCharCode(65 + index),
    content,
    vector: searchQueryVector.map(
      (value, dimension) => (dimension === rank ? 0.2 * rank : value) / norm,
    ),
  };
});
