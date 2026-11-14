import { getKitConfig } from '@/lib/kit/runtime-config';
import type { KitConfig } from '@/lib/kit/config-schema';
import type { Role } from '@/lib/llm/types';

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

/** TRD §31.4: prices follow each role; the runtime config applies demo overrides. */
export function rolePrice(role: Role, config: KitConfig = getKitConfig(false)) {
  const model = config.models[role] ?? config.models.chat;
  if (model.provider === 'ollama') return { inputPerMTok: 0, outputPerMTok: 0 };
  return config.pricing[`${model.provider}:${model.model}`] ?? null;
}

export function estimateCost(
  usage: AnswerUsage,
  config: KitConfig = getKitConfig(false),
): number | null {
  const embed = rolePrice('embed', config);
  const chat = rolePrice('chat', config);
  const rerank = rolePrice('rerank', config);
  if (!embed || !chat || !rerank) return null;
  const cost = (tokens: TokenUsage, price: NonNullable<ReturnType<typeof rolePrice>>) =>
    tokens.inputTokens * price.inputPerMTok +
    (tokens.outputTokens + (tokens.reasoningTokens ?? 0)) * price.outputPerMTok;
  return (
    (usage.embeddingTokens * embed.inputPerMTok +
      cost(usage.rerank, rerank) +
      cost(usage.generation, chat) +
      cost(usage.fallback, chat)) /
    1_000_000
  );
}
