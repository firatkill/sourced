import 'server-only';
import { z } from 'zod';
import { SSE } from '@/lib/config';
import { getSql } from '@/lib/db/client';
import { getEnv } from '@/lib/env';
import { isPublicDemo } from '@/lib/kit/profile';
import { sha256Hex } from '@/lib/hash';
import { PROMPT_VERSION } from '@/lib/prompts/version';
import { MetaEvent, CitationsEvent, DoneEvent, type SseEvent } from '@/lib/sse/events';
import type { SuggestedId } from '@/lib/suggested';

export const CachedAnswerPayload = z.object({
  meta: MetaEvent.omit({ requestId: true }),
  answerText: z.string(),
  citations: CitationsEvent,
  usageAtGeneration: DoneEvent.shape.usage,
  costUsdAtGeneration: z.number().nullable(),
});

export type CacheVersion = { corpusVersion: string; promptVersion: string; chatModel: string };
export type CachedAnswer = {
  payload: z.infer<typeof CachedAnswerPayload>;
  cachedAt: string;
  stale: boolean;
};

// Pool identity also keeps test databases from sharing a cached version.
const versions = new WeakMap<
  ReturnType<typeof getSql>,
  { value: string | null; expires: number }
>();

export async function currentCorpusVersion(now: () => number = Date.now): Promise<string | null> {
  const sql = getSql();
  const cached = versions.get(sql);
  if (cached && now() < cached.expires) return cached.value;
  const [row] = await sql<{ corpus_version: string | null }[]>`
    SELECT corpus_version FROM ingest_runs WHERE status = 'succeeded'
    ORDER BY finished_at DESC LIMIT 1`;
  const value = row?.corpus_version ?? null;
  versions.set(sql, { value, expires: now() + 60_000 });
  return value;
}

export function answerCacheKey(suggestedId: SuggestedId, version: CacheVersion): string {
  return sha256Hex(
    `${suggestedId}|${version.corpusVersion}|${version.promptVersion}|${version.chatModel}`,
  );
}

export async function currentCacheVersion(): Promise<CacheVersion | null> {
  const corpusVersion = await currentCorpusVersion();
  const chatModel = getEnv().CHAT_MODEL;
  return corpusVersion !== null && chatModel
    ? { corpusVersion, promptVersion: PROMPT_VERSION, chatModel }
    : null;
}

export async function lookupAnswerCache(suggestedId: SuggestedId): Promise<CachedAnswer | null> {
  if (!isPublicDemo()) return null;
  const env = getEnv();
  if (env.DEMO_MODE === 'off') return null;
  const sql = getSql();
  const version = await currentCacheVersion();
  type Row = { payload: unknown; created_at: Date };
  let row: Row | undefined;
  if (version) {
    [row] = await sql<
      Row[]
    >`SELECT payload, created_at FROM answer_cache WHERE cache_key = ${answerCacheKey(suggestedId, version)}`;
  }
  let stale = false;
  if (!row && env.DEMO_MODE === 'readonly') {
    [row] = await sql<
      Row[]
    >`SELECT payload, created_at FROM answer_cache WHERE suggested_id = ${suggestedId} ORDER BY created_at DESC LIMIT 1`;
    stale = true;
  }
  return row
    ? {
        payload: CachedAnswerPayload.parse(row.payload),
        cachedAt: row.created_at.toISOString(),
        stale,
      }
    : null;
}

export async function writeAnswerCache(input: {
  suggestedId: SuggestedId;
  question: string;
  version: CacheVersion;
  payload: z.infer<typeof CachedAnswerPayload>;
}): Promise<void> {
  const payload = CachedAnswerPayload.parse(input.payload);
  const key = answerCacheKey(input.suggestedId, input.version);
  const sql = getSql();
  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO answer_cache (cache_key, suggested_id, question, corpus_version, prompt_version, chat_model, payload)
      VALUES (${key}, ${input.suggestedId}, ${input.question}, ${input.version.corpusVersion}, ${input.version.promptVersion}, ${input.version.chatModel}, ${tx.json(payload)})
      ON CONFLICT (cache_key) DO UPDATE SET payload = EXCLUDED.payload, question = EXCLUDED.question, created_at = now()`;
    await tx`DELETE FROM answer_cache WHERE suggested_id = ${input.suggestedId} AND cache_key <> ${key}`;
  });
}

export function replayAnswerCache(input: {
  cached: CachedAnswer;
  requestId: string;
  emit: (event: SseEvent) => void;
}): z.infer<typeof DoneEvent> {
  const started = performance.now();
  const { payload, cachedAt } = input.cached;
  input.emit({
    event: 'meta',
    data: { ...payload.meta, requestId: input.requestId, cached: true, cachedAt },
  });
  let firstToken: number | null = null;
  for (let offset = 0; offset < payload.answerText.length; offset += SSE.CACHE_REPLAY_CHUNK_CHARS) {
    firstToken ??= performance.now() - started;
    input.emit({
      event: 'token',
      data: { delta: payload.answerText.slice(offset, offset + SSE.CACHE_REPLAY_CHUNK_CHARS) },
    });
  }
  input.emit({ event: 'citations', data: payload.citations });
  const done = DoneEvent.parse({
    requestId: input.requestId,
    cached: true,
    usage: { embeddingTokens: 0, inputTokens: 0, outputTokens: 0 },
    costUsdEstimate: 0,
    latencyMs: { total: performance.now() - started, firstToken, generation: 0 },
  });
  input.emit({ event: 'done', data: done });
  return done;
}
