import 'server-only';
import { z } from 'zod';
import { normalize } from '@/lib/citations/normalize';
import { getDb } from '@/lib/db/client';
import { queryLog } from '@/lib/db/schema';
import { getEnv } from '@/lib/env';
import { ErrorCodeSchema } from '@/lib/errors';
import { hmacSha256Hex } from '@/lib/hash';

const QueryLogInput = z.object({
  requestId: z.uuid(),
  question: z.string(),
  source: z.enum(['live', 'cache']),
  outcome: z.enum(['answered', 'not_found', 'rate_limited', 'aborted', 'error']),
  errorCode: ErrorCodeSchema.nullish(),
  suggestedId: z.string().nullish(),
  chatModel: z.string().nullish(),
  embeddingModel: z.string().nullish(),
  promptVersion: z.string().nullish(),
  corpusVersion: z.string().nullish(),
  passagesCount: z.number().int().nullish(),
  rerankFallback: z.boolean().nullish(),
  quoteFallbackUsed: z.boolean().nullish(),
  citationsValid: z.number().int().nullish(),
  citationsInvalid: z.number().int().nullish(),
  latencyTotalMs: z.number().int().nullish(),
  latencyFirstTokenMs: z.number().int().nullish(),
  latencyEmbedMs: z.number().int().nullish(),
  latencySearchMs: z.number().int().nullish(),
  latencyRerankMs: z.number().int().nullish(),
  latencyGenerationMs: z.number().int().nullish(),
  tokensEmbedding: z.number().int().nullish(),
  tokensInput: z.number().int().nullish(),
  tokensOutput: z.number().int().nullish(),
  costUsdEstimate: z.number().nullish(),
});

export type QueryLogInput = z.input<typeof QueryLogInput>;

/** TRD §20.2: the route calls this in after() only for eligible requests (D-23). */
export async function logQuery(input: QueryLogInput): Promise<void> {
  const { question, costUsdEstimate, ...metadata } = QueryLogInput.parse(input);
  const env = getEnv();
  await getDb()
    .insert(queryLog)
    .values({
      ...metadata,
      questionHash: hmacSha256Hex(env.QUESTION_HASH_SALT, normalize(question)),
      questionLength: question.length,
      questionText: env.STORE_QUESTIONS ? question : null,
      costUsdEstimate: costUsdEstimate == null ? null : String(costUsdEstimate),
    });
}
