import { getEnv } from '@/lib/env';

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  /** Only separately reported tokens, not tokens already included in outputTokens. */
  reasoningTokens?: number;
};

export type AnswerUsage = {
  embeddingTokens: number;
  rerank: TokenUsage;
  generation: TokenUsage;
  fallback: TokenUsage;
};

export function totalUsage(usage: AnswerUsage) {
  const calls = [usage.rerank, usage.generation, usage.fallback];
  return {
    embeddingTokens: usage.embeddingTokens,
    inputTokens: calls.reduce((sum, call) => sum + call.inputTokens, 0),
    outputTokens: calls.reduce(
      (sum, call) => sum + call.outputTokens + (call.reasoningTokens ?? 0),
      0,
    ),
  };
}

/** TRD §21.1: provider usage, with conservative undiscounted env prices. */
export function estimateCost(usage: AnswerUsage): number {
  const env = getEnv();
  const total = totalUsage(usage);
  return (
    (total.embeddingTokens * env.PRICE_EMBED_PER_MTOK +
      total.inputTokens * env.PRICE_CHAT_INPUT_PER_MTOK +
      total.outputTokens * env.PRICE_CHAT_OUTPUT_PER_MTOK) /
    1_000_000
  );
}
