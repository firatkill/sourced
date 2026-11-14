import { z } from 'zod';
const count = z.number().int().nonnegative();
export const IngestCounters = z.object({
  documents: z.object({ discovered: count, done: count, skipped: count, failed: count }),
  chunks: z.object({ new: count, changed: count, unchanged: count, deleted: count }),
  embeddingTokens: count,
  estimatedCostUsd: z.number().nonnegative().nullable(),
  boilerplateRemoved: count,
  skipped: z.array(z.object({ key: z.string(), reason: z.string() })),
  warnings: count,
});
export const IngestSource = IngestCounters.extend({
  id: z.string(),
  revision: z.string().optional(),
});
export const IngestResult = z.object({
  mode: z.enum(['run', 'dry-run']),
  runId: z.string().nullable(),
  corpusVersion: z.string().nullable(),
  sources: z.array(IngestSource),
  totals: IngestCounters,
});
export type IngestResult = z.infer<typeof IngestResult>;
export type IngestSource = z.infer<typeof IngestSource>;
export function emptyCounters(): z.infer<typeof IngestCounters> {
  return {
    documents: { discovered: 0, done: 0, skipped: 0, failed: 0 },
    chunks: { new: 0, changed: 0, unchanged: 0, deleted: 0 },
    embeddingTokens: 0,
    estimatedCostUsd: 0,
    boilerplateRemoved: 0,
    skipped: [],
    warnings: 0,
  };
}
export function sumCounters(sources: IngestSource[]): z.infer<typeof IngestCounters> {
  const total = emptyCounters();
  for (const source of sources) {
    for (const key of ['discovered', 'done', 'skipped', 'failed'] as const)
      total.documents[key] += source.documents[key];
    for (const key of ['new', 'changed', 'unchanged', 'deleted'] as const)
      total.chunks[key] += source.chunks[key];
    total.embeddingTokens += source.embeddingTokens;
    total.estimatedCostUsd =
      total.estimatedCostUsd === null || source.estimatedCostUsd === null
        ? null
        : total.estimatedCostUsd + source.estimatedCostUsd;
    total.boilerplateRemoved += source.boilerplateRemoved;
    total.skipped.push(...source.skipped);
    total.warnings += source.warnings;
  }
  return total;
}
