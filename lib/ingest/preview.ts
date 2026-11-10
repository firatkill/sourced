import { sha256Hex } from '@/lib/hash';
import { getKitConfig } from '@/lib/kit/runtime-config';
import { prepareChunkEmbedding } from './upsert';
import { chunkDocument } from './chunk';
import type { ParsedDocument } from './parse-html';
import { countTokens } from './tokenizer';

export function previewCorpus(
  documents: { slug: string; locationSlug?: string; document: ParsedDocument }[] & {
    sources?: { id: string; revision?: string }[];
  },
  pricePerMillion: number,
  contextualEmbedding = getKitConfig().overrides.contextualEmbedding,
) {
  const chunks = documents.flatMap(({ slug: key, locationSlug, document }) =>
    chunkDocument(document, locationSlug ?? key).map((chunk) => ({
      ...chunk,
      ...prepareChunkEmbedding(
        { title: document.title, slug: locationSlug ?? key },
        chunk,
        contextualEmbedding,
      ),
    })),
  );
  const counts = chunks.map((chunk) => chunk.tokenCount).sort((a, b) => a - b);
  const percentile = (fraction: number) =>
    counts[Math.max(0, Math.ceil(counts.length * fraction) - 1)] ?? 0;
  const embeddingTokens = chunks.reduce(
    (total, chunk) => total + countTokens(chunk.embeddingInput),
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
      [
        ...chunks.map((chunk) => chunk.contentHash),
        ...(documents.sources ?? [])
          .filter((source) => source.revision)
          .map((source) => `${source.id}:${source.revision ?? ''}`),
      ]
        .sort()
        .join('\n'),
    ),
  };
}
