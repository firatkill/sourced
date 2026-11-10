import { z } from 'zod';

const PassageBase = z.object({
  label: z.string().regex(/^P[1-9]$/),
  chunkId: z.string(),
  documentTitle: z.string(),
  headingPath: z.array(z.string()).min(1),
  pageFrom: z.number().int().positive().optional(),
  pageTo: z.number().int().positive().optional(),
  snippet: z.string(),
  content: z.string(),
  scores: z.object({
    rrf: z.number(),
    vectorRank: z.number().int().positive().nullable(),
    ftsRank: z.number().int().positive().nullable(),
    rerankPosition: z.number().int().positive(),
  }),
});

// File citations carry a display path, never a browser-navigable file URL.
export const PassageDto = z.union([
  PassageBase.extend({
    officialUrl: z.url({ protocol: /^https?$/ }),
    filePath: z.never().optional(),
  }),
  PassageBase.extend({ officialUrl: z.null(), filePath: z.string().min(1) }),
]);

export const MetaEvent = z.object({
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- normative TRD §12.2 schema
  requestId: z.string().uuid(),
  cached: z.boolean(),
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- normative TRD §12.2 schema
  cachedAt: z.string().datetime().nullable(),
  passages: z.array(PassageDto).max(9),
  retrieval: z.object({
    vectorCandidates: z.number().int(),
    ftsCandidates: z.number().int(),
    rerankFallback: z.boolean(),
    rerankFallbackReason: z.enum(['timeout', 'error', 'invalid_output', 'empty_output']).nullable(),
    timingsMs: z.object({ embed: z.number(), search: z.number(), rerank: z.number() }),
  }),
});

export const TokenEvent = z.object({ delta: z.string().min(1) });

export const InvalidReason = z.enum([
  'UNKNOWN_PASSAGE',
  'NO_QUOTE',
  'QUOTE_TOO_SHORT',
  'QUOTE_TOO_LONG',
  'QUOTE_NOT_FOUND',
]);

export const CitationsEvent = z.object({
  answer: z.string(), // verified answer: invalid markers removed; '' when notFound
  notFound: z.boolean(),
  valid: z.array(
    z.object({
      label: z.string().regex(/^P[1-9]$/),
      quote: z.string(),
      quoteSpan: z.object({
        start: z.number().int().nonnegative(),
        end: z.number().int().positive(),
      }),
    }),
  ),
  invalid: z.array(z.object({ label: z.string(), reason: InvalidReason })),
  quoteFallbackUsed: z.boolean(),
});

export const DoneEvent = z.object({
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- normative TRD §12.2 schema
  requestId: z.string().uuid(),
  cached: z.boolean(),
  usage: z.object({
    embeddingTokens: z.number().int(),
    inputTokens: z.number().int(), // rerank + answer + quote fallback
    outputTokens: z.number().int(),
  }),
  costUsdEstimate: z.number().nullable(),
  latencyMs: z.object({
    total: z.number(),
    firstToken: z.number().nullable(),
    generation: z.number(),
  }),
});

export const ErrorEvent = z.object({
  code: z.enum(['PROVIDER_ERROR', 'PROVIDER_TIMEOUT', 'RETRIEVAL_ERROR', 'INTERNAL_ERROR']),
  message: z.string(),
  retryable: z.boolean(),
  refunded: z.boolean(),
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- normative TRD §12.2 schema
  requestId: z.string().uuid(),
});

export const SseEvent = z.discriminatedUnion('event', [
  z.object({ event: z.literal('meta'), data: MetaEvent }),
  z.object({ event: z.literal('token'), data: TokenEvent }),
  z.object({ event: z.literal('citations'), data: CitationsEvent }),
  z.object({ event: z.literal('done'), data: DoneEvent }),
  z.object({ event: z.literal('error'), data: ErrorEvent }),
]);
export type SseEvent = z.infer<typeof SseEvent>;
