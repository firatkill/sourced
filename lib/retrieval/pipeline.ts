import { RETRIEVAL } from '@/lib/config';
import { AppError, RETRIEVAL_ERROR_MESSAGE } from '@/lib/errors';
import { embedQuery } from './embed-query';
import { rerank } from './rerank';
import { search } from './search';
import type { Passage, RetrievalResult } from './types';

export async function retrieve(
  question: string,
  signal: AbortSignal = new AbortController().signal,
): Promise<RetrievalResult> {
  const started = performance.now();
  const embedding = await embedQuery(question, signal);
  const embedMs = performance.now() - started;
  const searchStarted = performance.now();
  let candidates: RetrievalResult['candidates'];
  try {
    candidates = await search(embedding.vector, question);
  } catch (cause) {
    signal.throwIfAborted();
    throw new AppError('RETRIEVAL_ERROR', RETRIEVAL_ERROR_MESSAGE, { cause });
  }
  const searchMs = performance.now() - searchStarted;
  const result = await rerank(question, candidates, signal);
  const passages = result.reranked.slice(0, RETRIEVAL.FINAL_PASSAGES).map((chunk, index) => {
    const fragment = chunk.anchor.split('#')[1];
    return {
      ...chunk,
      label: `P${String(index + 1)}` as Passage['label'],
      rerankPosition: index + 1,
      officialUrl: fragment ? `${chunk.documentUrl}#${fragment}` : chunk.documentUrl,
    };
  });
  return {
    candidates,
    reranked: result.reranked,
    passages,
    rerankFallback: result.rerankFallback,
    rerankFallbackReason: result.rerankFallbackReason,
    usage: {
      embeddingTokens: embedding.tokens,
      rerankInputTokens: result.usage.inputTokens,
      rerankOutputTokens: result.usage.outputTokens,
    },
    timingsMs: { embed: embedMs, search: searchMs, rerank: result.rerankMs },
  };
}
