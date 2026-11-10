import { currentCorpusVersion } from '@/lib/cache/answer-cache';
import { getSql, closeSqlForTests } from '@/lib/db/client';
import { loadConfig } from '@/lib/kit/load-config';
import { getKitConfig, setCliKitConfig } from '@/lib/kit/runtime-config';
import { checkCorpusSchema } from '@/lib/kit/vector-schema';
import { answerQuestion } from '@/lib/generation/answer';
import { logQuery, type QueryLogInput } from '@/lib/querylog/log';
import { AskRequest } from '@/lib/http/ask-request';
import { PROMPT_VERSION } from '@/lib/prompts/version';
import { AppError } from '@/lib/errors';
import type { Invocation } from '../router';
import { requireSources } from './config-files';

export async function runAsk(input: Invocation) {
  const config = await loadConfig(process.cwd(), { writeSnapshot: false });
  requireSources(config);
  setCliKitConfig(config);
  const { question } = AskRequest.parse({ question: input.positionals[0] });
  const runtime = getKitConfig();
  const requestId = crypto.randomUUID();
  const signal = new AbortController();
  const interrupt = () => {
    signal.abort();
  };
  process.on('SIGINT', interrupt);
  const row: QueryLogInput = {
    requestId,
    question,
    source: 'cli',
    outcome: 'error',
    chatModel: runtime.models.chat.model,
    embeddingModel: runtime.models.embed.model,
    promptVersion: PROMPT_VERSION,
  };
  try {
    const state = await checkCorpusSchema(getSql(), runtime);
    const present = await getSql()<
      { present: boolean }[]
    >`SELECT EXISTS(SELECT 1 FROM chunks) AS present`;
    if (state.empty || !present[0]?.present)
      throw new AppError('CORPUS_EMPTY', 'Nothing is indexed yet.');
    const answer = await answerQuestion({
      question,
      requestId,
      signal: signal.signal,
      emit: () => {},
    });
    const { meta, verification, done } = answer;
    const outcome = verification.notFound ? ('not_found' as const) : ('answered' as const);
    Object.assign(row, {
      outcome,
      passagesCount: meta.passages.length,
      rerankFallback: meta.retrieval.rerankFallback,
      quoteFallbackUsed: verification.quoteFallbackUsed,
      citationsValid: verification.valid.length,
      citationsInvalid: verification.invalid.length,
      latencyTotalMs: Math.round(done.latencyMs.total),
      latencyFirstTokenMs:
        done.latencyMs.firstToken === null ? null : Math.round(done.latencyMs.firstToken),
      latencyEmbedMs: Math.round(meta.retrieval.timingsMs.embed),
      latencySearchMs: Math.round(meta.retrieval.timingsMs.search),
      latencyRerankMs: Math.round(meta.retrieval.timingsMs.rerank),
      latencyGenerationMs: Math.round(done.latencyMs.generation),
      tokensEmbedding: done.usage.embeddingTokens,
      tokensInput: done.usage.inputTokens,
      tokensOutput: done.usage.outputTokens,
      costUsdEstimate: done.costUsdEstimate,
    });
    return {
      outcome,
      answer: verification.answer,
      citations: verification.valid,
      ...(input.values.trace
        ? {
            trace: {
              passages: meta.passages,
              retrieval: meta.retrieval,
              usage: done.usage,
              costUsdEstimate: done.costUsdEstimate,
              latencyMs: done.latencyMs,
              invalid: verification.invalid,
              quoteFallbackUsed: verification.quoteFallbackUsed,
            },
          }
        : {}),
    };
  } catch (error) {
    if (signal.signal.aborted) {
      row.outcome = 'aborted';
      throw Object.assign(new Error('Interrupted'), { name: 'AbortPromptError' });
    }
    row.errorCode = error instanceof AppError ? error.code : 'INTERNAL_ERROR';
    throw error;
  } finally {
    process.off('SIGINT', interrupt);
    try {
      row.corpusVersion = await currentCorpusVersion();
      await logQuery(row);
    } finally {
      await closeSqlForTests();
    }
  }
}
