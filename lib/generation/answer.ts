import type { z } from 'zod';
import { GENERATION } from '@/lib/config';
import { verifyCitations } from '@/lib/citations/verify';
import { estimateCost, totalUsage, type AnswerUsage } from '@/lib/cost/estimate';
import { getEnv } from '@/lib/env';
import {
  AppError,
  INTERNAL_ERROR_MESSAGE,
  PROVIDER_ERROR_MESSAGE,
  PROVIDER_TIMEOUT_MESSAGE,
} from '@/lib/errors';
import { getProvider, isInvalidOutput } from '@/lib/llm';
import { MockDropSignal } from '@/lib/llm/mock';
import { createLogger } from '@/lib/logger';
import { buildAnswerPrompt, ANSWER_SYSTEM_PROMPT } from '@/lib/prompts/system';
import { buildQuotesPrompt, QUOTES_SYSTEM_PROMPT, QuotesOutput } from '@/lib/prompts/quotes';
import { retrieve, passageSnippet } from '@/lib/retrieval/pipeline';
import type { RetrievalResult } from '@/lib/retrieval/types';
import { CitationsEvent, DoneEvent, MetaEvent, type SseEvent } from '@/lib/sse/events';
import { createCitationSplitter } from './stream-splitter';

export type AnswerOutcome = {
  candidates: RetrievalResult['candidates'];
  reranked: RetrievalResult['reranked'];
  passages: RetrievalResult['passages'];
  retrieval: RetrievalResult;
  meta: z.infer<typeof MetaEvent>;
  verification: z.infer<typeof CitationsEvent>;
  usage: AnswerUsage;
  timingsMs: RetrievalResult['timingsMs'] & z.infer<typeof DoneEvent>['latencyMs'];
  done: z.infer<typeof DoneEvent>;
};

/** Abort even if a provider stalls without observing its signal. */
function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      reject(
        signal.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError'),
      );
    };
    signal.addEventListener('abort', abort, { once: true });
    void promise.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', abort);
    });
    if (signal.aborted) abort();
  });
}

async function runAnswer(input: {
  question: string;
  requestId: string;
  signal: AbortSignal;
  emit: (e: SseEvent) => void;
}): Promise<AnswerOutcome> {
  const started = performance.now();
  const retrieval = await retrieve(input.question, input.signal);
  const meta = MetaEvent.parse({
    requestId: input.requestId,
    cached: false,
    cachedAt: null,
    passages: retrieval.passages.map((p) => ({
      label: p.label,
      chunkId: p.chunkId,
      documentTitle: p.documentTitle,
      headingPath: p.headingPath,
      officialUrl: p.officialUrl,
      snippet: passageSnippet(p.content),
      content: p.content,
      scores: {
        rrf: p.rrfScore,
        vectorRank: p.vectorRank,
        ftsRank: p.ftsRank,
        rerankPosition: p.rerankPosition,
      },
    })),
    retrieval: {
      vectorCandidates: retrieval.vectorCandidates,
      ftsCandidates: retrieval.ftsCandidates,
      rerankFallback: retrieval.rerankFallback,
      rerankFallbackReason: retrieval.rerankFallbackReason,
      timingsMs: retrieval.timingsMs,
    },
  });
  input.emit({ event: 'meta', data: meta });
  const usage: AnswerUsage = {
    embeddingTokens: retrieval.usage.embeddingTokens,
    rerank: {
      inputTokens: retrieval.usage.rerankInputTokens,
      outputTokens: retrieval.usage.rerankOutputTokens,
    },
    generation: { inputTokens: 0, outputTokens: 0 },
    fallback: { inputTokens: 0, outputTokens: 0 },
  };
  let firstToken: number | null = null;
  let generation = 0;
  let answer = '';
  let block: string | null = null;
  const prompt = buildAnswerPrompt(input.question, retrieval.passages);
  if (prompt !== null) {
    const generationStarted = performance.now();
    const watchdog = new AbortController();
    const timer = setTimeout(() => {
      watchdog.abort(new DOMException('Timed out', 'TimeoutError'));
    }, GENERATION.FIRST_TOKEN_TIMEOUT_MS);
    const abortSignal = AbortSignal.any([
      input.signal,
      AbortSignal.timeout(GENERATION.TOTAL_TIMEOUT_MS),
      watchdog.signal,
    ]);
    const splitter = createCitationSplitter();
    const emitToken = (delta: string) => {
      if (!delta) return;
      if (firstToken === null) {
        firstToken = performance.now() - started;
        clearTimeout(timer);
      }
      input.emit({ event: 'token', data: { delta } });
    };
    try {
      const stream = getProvider().streamText({
        model: 'chat',
        system: ANSWER_SYSTEM_PROMPT,
        prompt,
        maxOutputTokens: getEnv().MAX_OUTPUT_TOKENS,
        abortSignal,
      });
      // Observe usage immediately, including when streaming fails first.
      const settledUsage = stream.usage.then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      );
      const iterator = stream.textStream[Symbol.asyncIterator]();
      for (;;) {
        const next = await withAbort(iterator.next(), abortSignal);
        abortSignal.throwIfAborted();
        if (next.done) break;
        emitToken(splitter.push(next.value));
      }
      const ended = splitter.end();
      emitToken(ended.flush);
      clearTimeout(timer);
      answer = ended.answer;
      block = ended.block;
      if (block === null) {
        const tail = /\{\s*"citations"\s*:\s*\[[\s\S]*\]\s*\}\s*$/.exec(answer);
        if (tail) {
          block = tail[0];
          answer = answer.slice(0, tail.index).trimEnd();
        }
      }
      const reported = await withAbort(settledUsage, abortSignal);
      if ('error' in reported) throw reported.error;
      usage.generation = reported.value;
    } catch (error) {
      input.signal.throwIfAborted();
      if (error instanceof MockDropSignal) throw error;
      const timeout =
        abortSignal.aborted ||
        (error instanceof AppError && error.code === 'PROVIDER_TIMEOUT') ||
        (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name));
      throw new AppError(
        timeout ? 'PROVIDER_TIMEOUT' : 'PROVIDER_ERROR',
        timeout ? PROVIDER_TIMEOUT_MESSAGE : PROVIDER_ERROR_MESSAGE,
        { cause: error, retryable: true },
      );
    } finally {
      clearTimeout(timer);
      generation = performance.now() - generationStarted;
    }
  }
  const verification = CitationsEvent.parse(
    await verifyCitations(answer, block, retrieval.passages, async (text, passages) => {
      const timeout = AbortSignal.timeout(GENERATION.QUOTE_FALLBACK_TIMEOUT_MS);
      const abortSignal = AbortSignal.any([input.signal, timeout]);
      try {
        const result = await withAbort(
          getProvider().generateObject({
            model: 'chat',
            system: QUOTES_SYSTEM_PROMPT,
            prompt: buildQuotesPrompt(
              text,
              passages.map((p) => ({ id: p.label, content: p.content })),
            ),
            schema: QuotesOutput,
            maxOutputTokens: GENERATION.QUOTE_FALLBACK_MAX_OUTPUT_TOKENS,
            abortSignal,
          }),
          abortSignal,
        );
        usage.fallback = result.usage;
        const quotes = QuotesOutput.parse(result.object);
        return new Map(quotes.citations.map((citation) => [citation.id, citation.quote]));
      } catch (error) {
        input.signal.throwIfAborted();
        createLogger().warn({
          event: 'quotes.fallback_failed',
          reason: timeout.aborted ? 'timeout' : isInvalidOutput(error) ? 'invalid_output' : 'error',
        });
        return new Map<string, string>();
      }
    }),
  );
  input.signal.throwIfAborted();
  input.emit({ event: 'citations', data: verification });
  const done = DoneEvent.parse({
    requestId: input.requestId,
    cached: false,
    usage: totalUsage(usage),
    costUsdEstimate: estimateCost(usage),
    latencyMs: { total: performance.now() - started, firstToken, generation },
  });
  input.emit({ event: 'done', data: done });
  return {
    candidates: retrieval.candidates,
    reranked: retrieval.reranked,
    passages: retrieval.passages,
    retrieval,
    meta,
    verification,
    usage,
    timingsMs: { ...retrieval.timingsMs, ...done.latencyMs },
    done,
  };
}

/** The route owns error events and quota refunds; callers observe streamed tokens. */
export async function answerQuestion(
  input: Parameters<typeof runAnswer>[0],
): Promise<AnswerOutcome> {
  try {
    return await runAnswer(input);
  } catch (error) {
    input.signal.throwIfAborted();
    if (error instanceof AppError || error instanceof MockDropSignal) throw error;
    throw new AppError('INTERNAL_ERROR', INTERNAL_ERROR_MESSAGE, {
      cause: error,
      retryable: true,
    });
  }
}
