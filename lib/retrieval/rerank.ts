import { getKitConfig } from '@/lib/kit/runtime-config';
import { z } from 'zod';
import { RETRIEVAL } from '@/lib/config';
import { AppError } from '@/lib/errors';
import { decode, encode } from '@/lib/ingest/tokenizer';
import { getProviders, isInvalidOutput } from '@/lib/llm';
import { createLogger } from '@/lib/logger';
import { buildRerankPrompt, RERANK_SYSTEM_PROMPT } from '@/lib/prompts/rerank';
import type { RetrievedChunk, RetrievalResult } from './types';

export const RerankOutput = z.object({
  ranking: z.array(z.string().regex(/^R([1-9]|1[0-9]|20)$/i)).max(RETRIEVAL.RERANK_CANDIDATES),
});

type RerankResult = Pick<
  RetrievalResult,
  'reranked' | 'rerankFallback' | 'rerankFallbackReason'
> & {
  rerankMs: number;
  usage: { inputTokens: number; outputTokens: number };
};

function truncate(content: string): string {
  const tokens = encode(content);
  if (tokens.length <= RETRIEVAL.RERANK_PASSAGE_MAX_TOKENS) return content;
  let prefix = decode(tokens.slice(0, RETRIEVAL.RERANK_PASSAGE_MAX_TOKENS));
  // Back up to a whole word and include the ellipsis in the prompt's token cap.
  // The prompt builder also caps content, so it must not cut off our ellipsis.
  do {
    const boundary = /\s+\S*$/.exec(prefix);
    prefix = boundary ? prefix.slice(0, boundary.index).trimEnd() : '';
  } while (encode(`${prefix}…`).length > RETRIEVAL.RERANK_PASSAGE_MAX_TOKENS);
  return `${prefix}…`;
}

/** TRD §9.4: one listwise call, with RRF order retained on failure. */
export async function rerank(
  question: string,
  candidates: RetrievedChunk[],
  signal: AbortSignal,
): Promise<RerankResult> {
  signal.throwIfAborted();
  const usage = { inputTokens: 0, outputTokens: 0 };
  if (
    candidates.length <=
    (getKitConfig().overrides.retrieval.finalPassages ?? RETRIEVAL.FINAL_PASSAGES)
  ) {
    return {
      reranked: candidates,
      rerankFallback: false,
      rerankFallbackReason: null,
      rerankMs: 0,
      usage,
    };
  }

  const started = performance.now();
  const timeout = AbortSignal.timeout(RETRIEVAL.RERANK_TIMEOUT_MS);
  const abortSignal = AbortSignal.any([signal, timeout]);
  const fallback = (reason: NonNullable<RetrievalResult['rerankFallbackReason']>): RerankResult => {
    createLogger().warn({ event: 'rerank.fallback', reason });
    return {
      reranked: candidates,
      rerankFallback: true,
      rerankFallbackReason: reason,
      rerankMs: performance.now() - started,
      usage,
    };
  };

  try {
    const result = await getProviders().rerank.generateObject({
      model: 'rerank',
      system: RERANK_SYSTEM_PROMPT,
      prompt: buildRerankPrompt(
        question,
        candidates.map((candidate) => ({ ...candidate, content: truncate(candidate.content) })),
      ),
      schema: RerankOutput,
      maxOutputTokens: RETRIEVAL.RERANK_MAX_OUTPUT_TOKENS,
      abortSignal,
    });
    signal.throwIfAborted();
    abortSignal.throwIfAborted();
    Object.assign(usage, result.usage);
    const { ranking } = RerankOutput.parse(result.object);
    const byId = new Map(
      candidates.map((candidate, index) => [`R${String(index + 1)}`, candidate]),
    );
    const rankedIds = [...new Set(ranking.map((id) => id.toUpperCase()))].filter((id) =>
      byId.has(id),
    );
    if (rankedIds.length === 0) return fallback('empty_output');
    const remaining = new Set(byId.keys());
    const reranked: RetrievedChunk[] = [];
    for (const id of rankedIds) {
      const candidate = byId.get(id);
      if (candidate) reranked.push(candidate);
      remaining.delete(id);
    }
    for (const id of remaining) {
      const candidate = byId.get(id);
      if (candidate) reranked.push(candidate);
    }
    return {
      reranked,
      rerankFallback: false,
      rerankFallbackReason: null,
      rerankMs: performance.now() - started,
      usage,
    };
  } catch (error) {
    // Providers normalize aborts, so the request signal is the source of truth.
    signal.throwIfAborted();
    if (
      timeout.aborted ||
      (error instanceof AppError && error.code === 'PROVIDER_TIMEOUT') ||
      (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name))
    ) {
      return fallback('timeout');
    }
    return fallback(isInvalidOutput(error) ? 'invalid_output' : 'error');
  }
}
