import { sha256Hex } from '@/lib/hash';
import { chunkContentHash, chunkDocument } from './chunk';
import type { ParsedDocument } from './parse-html';
import { countTokens } from './tokenizer';

export function previewCorpus(
  documents: { slug: string; document: ParsedDocument }[],
  pricePerMillion: number,
) {
  const chunks = documents.flatMap(({ slug, document }) =>
    chunkDocument(document, slug).map((chunk) => ({
      ...chunk,
      hash: chunkContentHash(slug, chunk),
    })),
  );
  const counts = chunks.map((chunk) => chunk.tokenCount).sort((a, b) => a - b);
  const percentile = (fraction: number) =>
    counts[Math.max(0, Math.ceil(counts.length * fraction) - 1)] ?? 0;
  const embeddingTokens = chunks.reduce(
    (total, chunk) => total + countTokens(`${chunk.headingPath.join(' › ')}\n\n${chunk.content}`),
    0,
  );
  return {
    documents: documents.length,
    chunks: chunks.length,
    tokens: {
      min: counts[0] ?? 0,
      p50: percentile(0.5),
      p95: percentile(0.95),
      max: counts.at(-1) ?? 0,
    },
    embeddingTokens,
    estimatedCostUsd: (embeddingTokens * pricePerMillion) / 1_000_000,
    corpusVersion: sha256Hex(
      chunks
        .map((chunk) => chunk.hash)
        .sort()
        .join('\n'),
    ),
  };
}
