import 'server-only';
import { createOpenAI } from '@ai-sdk/openai';
import { embedMany, generateText, Output, streamText } from 'ai';
import { EMBEDDING, GENERATION } from '@/lib/config';
import { getEnv } from '@/lib/env';
import { AppError, PROVIDER_ERROR_MESSAGE, PROVIDER_TIMEOUT_MESSAGE } from '@/lib/errors';
import { modelCapabilities } from './models';
import type { LlmProvider, Role } from './types';

function modelFor(role: Role, configuredId?: string) {
  const env = getEnv();
  const id = configuredId ?? (role === 'judge' ? env.JUDGE_MODEL : env.CHAT_MODEL);
  if (!env.OPENAI_API_KEY || !id) {
    throw new AppError('PROVIDER_ERROR', 'Language model is not configured.');
  }
  return createOpenAI({ apiKey: env.OPENAI_API_KEY })(id);
}

function providerError(error: unknown, signal?: AbortSignal): AppError {
  const timeout =
    signal?.aborted ||
    (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name));
  return new AppError(
    timeout ? 'PROVIDER_TIMEOUT' : 'PROVIDER_ERROR',
    timeout ? PROVIDER_TIMEOUT_MESSAGE : PROVIDER_ERROR_MESSAGE,
    { cause: error },
  );
}

function usageOf(usage: { inputTokens?: number | undefined; outputTokens?: number | undefined }) {
  return { inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0 };
}

/** Capability injection lets tests verify models that reject temperature. */
export function createOpenaiProvider(
  supportsTemperature?: boolean,
  model?: string,
  embed: { model: string; dimensions: number } = {
    model: EMBEDDING.MODEL,
    dimensions: EMBEDDING.DIMENSIONS,
  },
): LlmProvider {
  return {
    name: 'openai',
    async embed(values, opts) {
      const apiKey = getEnv().OPENAI_API_KEY;
      if (!apiKey) throw new AppError('PROVIDER_ERROR', 'OpenAI API key is not configured.');
      const openai = createOpenAI({ apiKey });
      // A-05 / embedding portion of A-11: verified against installed AI SDK 7 source.
      const result = await embedMany({
        model: openai.embedding(embed.model),
        values,
        providerOptions: { openai: { dimensions: embed.dimensions } },
        maxRetries: 0,
        ...(opts?.abortSignal ? { abortSignal: opts.abortSignal } : {}),
      });
      return { vectors: result.embeddings, tokens: result.usage.tokens };
    },
    streamText(args) {
      // Start lazily so even setup failures are thrown from the public iterator.
      let resolveUsage: (usage: { inputTokens: number; outputTokens: number }) => void = () => {};
      const usage = new Promise<{ inputTokens: number; outputTokens: number }>((resolve) => {
        resolveUsage = resolve;
      });
      return {
        usage,
        textStream: (async function* () {
          try {
            args.abortSignal?.throwIfAborted();
            const result = streamText({
              // fullStream below owns errors; the SDK default logs raw provider errors.
              onError: () => {},
              model: modelFor(args.model, model),
              instructions: args.system,
              prompt: args.prompt,
              maxOutputTokens: args.maxOutputTokens,
              maxRetries: 0,
              ...((supportsTemperature ??
              modelCapabilities('openai', model ?? getEnv().CHAT_MODEL ?? '').supportsTemperature)
                ? { temperature: GENERATION.TEMPERATURE }
                : {}),
              providerOptions: { openai: { reasoningEffort: 'none' } },
              ...(args.abortSignal ? { abortSignal: args.abortSignal } : {}),
            });
            // Attach rejection handling immediately: callers may only consume textStream.
            const mappedUsage = Promise.resolve(result.usage).then(usageOf, () => usageOf({}));
            void mappedUsage.then(resolveUsage);
            // eslint-disable-next-line @typescript-eslint/no-deprecated -- TRD §13.0 explicitly requires fullStream
            for await (const part of result.fullStream) {
              args.abortSignal?.throwIfAborted();
              if (part.type === 'error') throw part.error;
              if (part.type === 'abort') throw new DOMException('Aborted', 'AbortError');
              if (part.type === 'text-delta') yield part.text;
            }
            args.abortSignal?.throwIfAborted();
            resolveUsage(await mappedUsage);
          } catch (error) {
            throw providerError(error, args.abortSignal);
          } finally {
            resolveUsage(usageOf({}));
          }
        })(),
      };
    },
    async generateObject(args) {
      try {
        args.abortSignal?.throwIfAborted();
        const result = await generateText({
          model: modelFor(args.model, model),
          instructions: args.system,
          prompt: args.prompt,
          output: Output.object({ schema: args.schema }),
          maxOutputTokens: args.maxOutputTokens,
          maxRetries: 0,
          ...((supportsTemperature ??
          modelCapabilities('openai', model ?? getEnv().CHAT_MODEL ?? '').supportsTemperature)
            ? { temperature: GENERATION.TEMPERATURE }
            : {}),
          providerOptions: { openai: { reasoningEffort: 'none', strictJsonSchema: false } },
          ...(args.abortSignal ? { abortSignal: args.abortSignal } : {}),
        });
        args.abortSignal?.throwIfAborted();
        return { object: args.schema.parse(result.output), usage: usageOf(result.usage) };
      } catch (error) {
        throw providerError(error, args.abortSignal);
      }
    },
  };
}

export const openaiProvider = createOpenaiProvider();
