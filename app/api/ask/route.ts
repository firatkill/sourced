import { after } from 'next/server';
import { z } from 'zod';
import {
  lookupAnswerCache,
  replayAnswerCache,
  currentCorpusVersion,
} from '@/lib/cache/answer-cache';
import { normalize } from '@/lib/citations/normalize';
import { EMBEDDING, MAINTENANCE, QUESTION } from '@/lib/config';
import { getEnv } from '@/lib/env';
import { isPublicDemo } from '@/lib/kit/profile';
import {
  AppError,
  INTERNAL_ERROR_MESSAGE,
  PROVIDER_ERROR_MESSAGE,
  PROVIDER_TIMEOUT_MESSAGE,
  RETRIEVAL_ERROR_MESSAGE,
  type ErrorCode,
} from '@/lib/errors';
import { answerQuestion } from '@/lib/generation/answer';
import { AskRequest, validationDetails, type ValidationDetails } from '@/lib/http/ask-request';
import { jsonError } from '@/lib/http/errors';
import { MockDropSignal } from '@/lib/llm/mock';
import { withRequest } from '@/lib/logger';
import { PROMPT_VERSION } from '@/lib/prompts/version';
import { logQuery, type QueryLogInput } from '@/lib/querylog/log';
import { hashVisitor } from '@/lib/ratelimit/ip';
import { cleanup, consume, refund } from '@/lib/ratelimit/limiter';
import { encodeEvent, startHeartbeat } from '@/lib/sse/encode';
import { SseEvent } from '@/lib/sse/events';
import { matchSuggested, SUGGESTED } from '@/lib/suggested';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function allowedOrigin(request: Request): boolean {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return false;
  const origin = request.headers.get('origin');
  if (origin === null) return true;
  const env = getEnv();
  const allowed = new Set([
    new URL(env.NEXT_PUBLIC_SITE_URL).origin,
    ...[env.VERCEL_URL, env.VERCEL_BRANCH_URL, env.VERCEL_PROJECT_PRODUCTION_URL]
      .filter((host): host is string => typeof host === 'string' && host.length > 0)
      .map((host) => `https://${host}`),
    ...env.ALLOWED_ORIGINS.split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  ]);
  if (allowed.has(origin)) return true;
  if (env.VERCEL_ENV === 'production') return false;
  try {
    const url = new URL(origin);
    return (
      url.origin === origin &&
      url.protocol === 'http:' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
    );
  } catch {
    return false;
  }
}

export async function POST(request: Request): Promise<Response> {
  const suppliedId = z.uuid().safeParse(request.headers.get('x-request-id'));
  const requestId = suppliedId.success ? suppliedId.data : crypto.randomUUID();
  const logger = withRequest(requestId);
  const started = performance.now();
  const reject = (code: ErrorCode, status: number, details?: ValidationDetails) => {
    logger[code === 'ORIGIN_FORBIDDEN' ? 'warn' : 'info']({ event: 'ask.rejected', code, status });
    return jsonError({ code, status, requestId, ...(details ? { details } : {}) });
  };
  let row: QueryLogInput | undefined;
  let resolveFinished: () => void = () => {};
  const finished = new Promise<void>((resolve) => {
    resolveFinished = resolve;
  });
  let scheduled = false;
  const scheduleLog = () => {
    if (scheduled) return;
    scheduled = true;
    after(async () => {
      await finished;
      try {
        if (row) {
          row.corpusVersion = await currentCorpusVersion();
          await logQuery(row);
        }
      } catch {
        logger.warn({ event: 'querylog.failed' });
      }
      if (Math.random() < MAINTENANCE.CLEANUP_PROBABILITY) await cleanup(requestId);
    });
  };

  try {
    if (
      request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
      'application/json'
    )
      return reject('UNSUPPORTED_MEDIA_TYPE', 415);
    const contentLength = request.headers.get('content-length');
    if (contentLength !== null && Number(contentLength) > QUESTION.MAX_BODY_BYTES)
      return reject('PAYLOAD_TOO_LARGE', 413);
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > QUESTION.MAX_BODY_BYTES)
      return reject('PAYLOAD_TOO_LARGE', 413);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return reject('VALIDATION_FAILED', 400, { field: 'body', reason: 'invalid_json' });
    }
    const parsed = AskRequest.safeParse(body);
    if (!parsed.success)
      return reject('VALIDATION_FAILED', 400, validationDetails(parsed.error, body));
    if (!allowedOrigin(request)) return reject('ORIGIN_FORBIDDEN', 403);
    const env = getEnv();
    const publicDemo = isPublicDemo();
    if (publicDemo && env.DEMO_MODE === 'off') return reject('DEMO_OFF', 503);
    const { question, suggestedId: suppliedSuggested } = parsed.data;
    const canonical = SUGGESTED.find((entry) => entry.id === suppliedSuggested);
    const suggestedId =
      canonical && normalize(canonical.question) === normalize(question)
        ? canonical.id
        : matchSuggested(question);
    logger.info({ event: 'ask.received', questionLength: question.length, suggestedId });
    row = {
      requestId,
      question,
      suggestedId,
      source: 'live',
      outcome: 'error',
      chatModel: env.CHAT_MODEL ?? null,
      embeddingModel: env.LLM_MODE === 'mock' ? EMBEDDING.MOCK_MODEL : EMBEDDING.MODEL,
      promptVersion: PROMPT_VERSION,
    };
    const cached = publicDemo && suggestedId ? await lookupAnswerCache(suggestedId) : null;
    if (publicDemo && !cached && env.DEMO_MODE === 'readonly') {
      row = undefined;
      return reject('DEMO_READONLY', 503);
    }
    scheduleLog();
    const now = new Date();
    const ipHash = !publicDemo || cached ? null : hashVisitor(request.headers, now);
    const quota = ipHash === null ? null : await consume(ipHash, now);
    if (quota && !quota.ok) {
      const code = quota.scope === 'ip' ? 'RATE_LIMITED_IP' : 'RATE_LIMITED_GLOBAL';
      row.outcome = 'rate_limited';
      row.errorCode = code;
      row.latencyTotalMs = Math.round(performance.now() - started);
      resolveFinished();
      logger[quota.scope === 'global' ? 'warn' : 'info']({
        event: 'ask.rate_limited',
        scope: quota.scope,
      });
      return jsonError({
        code,
        status: 429,
        requestId,
        resetAt: quota.resetAt,
        retryAfter: Math.max(0, Math.ceil((quota.resetAt.getTime() - now.getTime()) / 1000)),
      });
    }
    if (cached) {
      row.source = 'cache';
      logger.info({ event: 'ask.cache_hit', suggestedId, stale: cached.stale });
    }
    // Capture this request's mutable log record; after() waits for its terminal state.
    const streamRow = row;
    const abortController = new AbortController();
    let closed = false;
    let firstToken = false;
    let stopHeartbeat = () => {};
    let controller: ReadableStreamDefaultController<Uint8Array>;
    let refundPromise: Promise<boolean> | undefined;
    const refundOnce = (): Promise<boolean> => {
      refundPromise ??= (async () => {
        if (firstToken || !quota?.ok || ipHash === null) return false;
        try {
          await refund(ipHash, quota.day);
          return true;
        } catch {
          logger.warn({ event: 'ask.refund_failed' });
          return false;
        }
      })();
      return refundPromise;
    };
    const close = (cancelled = false) => {
      if (closed) return;
      closed = true;
      stopHeartbeat();
      request.signal.removeEventListener('abort', onAbort);
      if (!cancelled) controller.close();
      streamRow.latencyTotalMs ??= Math.round(performance.now() - started);
      resolveFinished();
    };
    const abort = (cancelled = false) => {
      if (closed) return;
      streamRow.outcome = 'aborted';
      streamRow.errorCode = null;
      abortController.abort();
      logger.info({
        event: 'ask.aborted',
        atPhase: firstToken ? 'streaming' : 'before_first_token',
      });
      close(cancelled);
    };
    const onAbort = () => {
      abort();
    };
    const send = (event: SseEvent) => {
      if (closed) return;
      if (env.NODE_ENV !== 'production') SseEvent.parse(event);
      controller.enqueue(encodeEvent(event));
      switch (event.event) {
        case 'meta':
          streamRow.passagesCount = event.data.passages.length;
          streamRow.rerankFallback = event.data.retrieval.rerankFallback;
          streamRow.latencyEmbedMs = Math.round(event.data.retrieval.timingsMs.embed);
          streamRow.latencySearchMs = Math.round(event.data.retrieval.timingsMs.search);
          streamRow.latencyRerankMs = Math.round(event.data.retrieval.timingsMs.rerank);
          break;
        case 'token':
          if (!firstToken) {
            streamRow.latencyFirstTokenMs = Math.round(performance.now() - started);
            logger.info({
              event: 'generation.first_token',
              firstTokenMs: streamRow.latencyFirstTokenMs,
            });
          }
          firstToken = true;
          break;
        case 'citations':
          streamRow.outcome = event.data.notFound ? 'not_found' : 'answered';
          streamRow.citationsValid = event.data.valid.length;
          streamRow.citationsInvalid = event.data.invalid.length;
          streamRow.quoteFallbackUsed = event.data.quoteFallbackUsed;
          logger.info({
            event: 'citations.verified',
            valid: event.data.valid.length,
            invalid: event.data.invalid.length,
            reasons: event.data.invalid.map((item) => item.reason),
            quoteFallbackUsed: event.data.quoteFallbackUsed,
            notFound: event.data.notFound,
          });
          break;
        case 'done':
          streamRow.tokensEmbedding = event.data.usage.embeddingTokens;
          streamRow.tokensInput = event.data.usage.inputTokens;
          streamRow.tokensOutput = event.data.usage.outputTokens;
          streamRow.costUsdEstimate = event.data.costUsdEstimate;
          streamRow.latencyGenerationMs = Math.round(event.data.latencyMs.generation);
          logger.info({
            event: 'ask.done',
            totalMs: Math.round(performance.now() - started),
            inputTokens: event.data.usage.inputTokens,
            outputTokens: event.data.usage.outputTokens,
            costUsd: event.data.costUsdEstimate,
          });
          close();
          break;
        case 'error':
          close();
          break;
      }
    };
    let failure: Promise<void> | undefined;
    const fail = (error: unknown): Promise<void> => {
      failure ??= (async () => {
        if (closed) return;
        streamRow.outcome = 'error';
        if (env.LLM_MODE === 'mock' && error instanceof MockDropSignal) {
          streamRow.errorCode = null;
          close();
          return;
        }
        const code =
          error instanceof AppError &&
          ['PROVIDER_ERROR', 'PROVIDER_TIMEOUT', 'RETRIEVAL_ERROR'].includes(error.code)
            ? (error.code as 'PROVIDER_ERROR' | 'PROVIDER_TIMEOUT' | 'RETRIEVAL_ERROR')
            : 'INTERNAL_ERROR';
        const message = {
          PROVIDER_ERROR: PROVIDER_ERROR_MESSAGE,
          PROVIDER_TIMEOUT: PROVIDER_TIMEOUT_MESSAGE,
          RETRIEVAL_ERROR: RETRIEVAL_ERROR_MESSAGE,
          INTERNAL_ERROR: INTERNAL_ERROR_MESSAGE,
        }[code];
        streamRow.errorCode = code;
        logger.error({ event: 'ask.error', code, errorMessage: message });
        const refunded = await refundOnce();
        send({ event: 'error', data: { code, message, requestId, retryable: true, refunded } });
      })();
      return failure;
    };
    const stream = new ReadableStream<Uint8Array>({
      start(streamController) {
        controller = streamController;
        stopHeartbeat = startHeartbeat((bytes) => {
          if (!closed) controller.enqueue(bytes);
        });
        request.signal.addEventListener('abort', onAbort, { once: true });
        if (request.signal.aborted) {
          abort();
          return;
        }
        void (async () => {
          try {
            const emit = (event: SseEvent) => {
              if (event.event === 'error') {
                void fail(new AppError(event.data.code, event.data.message));
              } else if (!failure) send(event);
            };
            if (cached) replayAnswerCache({ cached, requestId, emit });
            else
              await answerQuestion({ question, requestId, signal: abortController.signal, emit });
          } catch (error) {
            await fail(error);
          }
        })();
      },
      cancel() {
        abort(true);
      },
    });
    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
        'X-Request-Id': requestId,
      },
    });
  } catch {
    if (row) {
      row.outcome = 'error';
      row.errorCode = 'INTERNAL_ERROR';
      scheduleLog();
    }
    resolveFinished();
    logger.error({
      event: 'ask.error',
      code: 'INTERNAL_ERROR',
      errorMessage: INTERNAL_ERROR_MESSAGE,
    });
    return jsonError({ code: 'INTERNAL_ERROR', status: 500, requestId });
  }
}
