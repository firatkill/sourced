import { z } from 'zod';
const count = z.number().int().nonnegative();
export const InspectFinding = z.object({
  code: z.enum([
    'empty_document',
    'needs_ocr',
    'tiny_chunks',
    'oversized_chunks',
    'near_duplicates',
    'boilerplate_removed',
    'language_mismatch',
    'skipped_files',
    'failed_items',
  ]),
  severity: z.enum(['info', 'warn', 'error']),
  affects: z.array(z.enum(['retrieval', 'citations', 'cost'])),
  fix: z.string().min(1),
  sourceId: z.string().optional(),
  count: count.optional(),
  details: z
    .object({
      items: z.array(z.object({ key: z.string(), reason: z.string().nullable() })).optional(),
      configuredLanguage: z.string().optional(),
      detectedLanguage: z.string().optional(),
      sampledChunks: count.optional(),
      totalChunks: count.optional(),
      method: z.string().optional(),
      pairs: z
        .array(z.object({ chunkId: z.string(), otherChunkId: z.string(), similarity: z.number() }))
        .optional(),
      note: z.string().optional(),
    })
    .optional(),
});
export const InspectSource = z.object({
  id: z.string(),
  documents: count,
  chunks: count,
  smallestChunkTokens: count.nullable(),
  largestChunkTokens: count.nullable(),
});
export const InspectResult = z.object({
  corpus: z.string(),
  sources: z.array(InspectSource),
  findings: z.array(InspectFinding),
  path: z.string(),
});
export type InspectFinding = z.infer<typeof InspectFinding>;
export type InspectResult = z.infer<typeof InspectResult>;
