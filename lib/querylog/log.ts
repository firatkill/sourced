import 'server-only';
import { z } from 'zod';
import { normalize } from '@/lib/citations/normalize';
import { getSql } from '@/lib/db/client';
import { getEnv } from '@/lib/env';
import { ErrorCodeSchema } from '@/lib/errors';
import { hmacSha256Hex } from '@/lib/hash';

const QueryLogInput = z.object({
  requestId: z.uuid(),
  question: z.string(),
  source: z.enum(['live', 'cache', 'cli']),
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
  const data = QueryLogInput.parse(input);
  const { question } = data;
  const env = getEnv();
  // Drizzle initialization mutates the shared client's JSON/date codecs. Keep
  // logging on the same bound-SQL path as cache and retrieval (TRD §6.2).
  await getSql()`INSERT INTO query_log (
    request_id, source, outcome, error_code, question_hash, question_length, question_text,
    suggested_id, chat_model, embedding_model, prompt_version, corpus_version,
    passages_count, rerank_fallback, quote_fallback_used, citations_valid, citations_invalid,
    latency_total_ms, latency_first_token_ms, latency_embed_ms, latency_search_ms,
    latency_rerank_ms, latency_generation_ms, tokens_embedding, tokens_input, tokens_output,
    cost_usd_estimate
  ) VALUES (
    ${data.requestId}, ${data.source}, ${data.outcome}, ${data.errorCode ?? null},
    ${hmacSha256Hex(env.QUESTION_HASH_SALT, normalize(question))}, ${question.length},
    ${env.STORE_QUESTIONS ? question : null}, ${data.suggestedId ?? null},
    ${data.chatModel ?? null}, ${data.embeddingModel ?? null}, ${data.promptVersion ?? null},
    ${data.corpusVersion ?? null}, ${data.passagesCount ?? null}, ${data.rerankFallback ?? null},
    ${data.quoteFallbackUsed ?? null}, ${data.citationsValid ?? null}, ${data.citationsInvalid ?? null},
    ${data.latencyTotalMs ?? null}, ${data.latencyFirstTokenMs ?? null},
    ${data.latencyEmbedMs ?? null}, ${data.latencySearchMs ?? null}, ${data.latencyRerankMs ?? null},
    ${data.latencyGenerationMs ?? null}, ${data.tokensEmbedding ?? null},
    ${data.tokensInput ?? null}, ${data.tokensOutput ?? null}, ${data.costUsdEstimate ?? null}
  )`;
}
