export function rrfMerge(
  vectorIds: string[],
  ftsIds: string[],
  k: number,
  limit: number,
): Array<{ id: string; score: number; vectorRank: number | null; ftsRank: number | null }> {
  const vectors = new Map(vectorIds.map((id, index) => [id, index + 1]));
  const fullText = new Map(ftsIds.map((id, index) => [id, index + 1]));
  return [...new Set([...vectorIds, ...ftsIds])]
    .map((id) => {
      const vectorRank = vectors.get(id) ?? null;
      const ftsRank = fullText.get(id) ?? null;
      return {
        id,
        vectorRank,
        ftsRank,
        score:
          (vectorRank === null ? 0 : 1 / (k + vectorRank)) +
          (ftsRank === null ? 0 : 1 / (k + ftsRank)),
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        Math.min(a.vectorRank ?? Infinity, a.ftsRank ?? Infinity) -
          Math.min(b.vectorRank ?? Infinity, b.ftsRank ?? Infinity) ||
        (BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0),
    )
    .slice(0, limit);
}
