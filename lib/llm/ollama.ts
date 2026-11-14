import 'server-only';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { embedMany, generateText, Output, streamText } from 'ai';
import { GENERATION } from '@/lib/config';
import { getEnv } from '@/lib/env';
import { AppError, PROVIDER_ERROR_MESSAGE, PROVIDER_TIMEOUT_MESSAGE } from '@/lib/errors';
import { modelCapabilities } from './models';
import type { LlmProvider } from './types';

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

/** TRD §31: role-bound adapter; fetch injection keeps transport tests offline. */
export function createOllamaProvider(
  model: string,
  embed: { model: string; dimensions: number },
  fetch?: typeof globalThis.fetch,
): LlmProvider {
  const client = () =>
    createOpenAICompatible({
      name: 'ollama',
      baseURL: `${getEnv().OLLAMA_BASE_URL.replace(/\/+$/, '')}/v1`,
      supportsStructuredOutputs: false,
      ...(fetch ? { fetch } : {}),
    });
  return {
    name: 'ollama',
    async embed(values, opts) {
      try {
        opts?.abortSignal?.throwIfAborted();
        const result = await embedMany({
          model: client().embeddingModel(embed.model),
          values,
          providerOptions: { ollama: { dimensions: embed.dimensions } },
          maxRetries: 0,
          ...(opts?.abortSignal ? { abortSignal: opts.abortSignal } : {}),
        });
        opts?.abortSignal?.throwIfAborted();
        return {
          vectors: result.embeddings,
          tokens: Number.isFinite(result.usage.tokens) ? result.usage.tokens : 0,
        };
      } catch (error) {
        throw providerError(error, opts?.abortSignal);
      }
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
              model: client()(model),
              instructions: args.system,
              prompt: args.prompt,
              maxOutputTokens: args.maxOutputTokens,
              maxRetries: 0,
              ...(modelCapabilities('ollama', model).supportsTemperature
                ? { temperature: GENERATION.TEMPERATURE }
                : {}),
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
          model: client()(model),
          instructions: args.system,
          prompt: args.prompt,
          output: Output.json(),
          maxOutputTokens: args.maxOutputTokens,
          maxRetries: 0,
          ...(modelCapabilities('ollama', model).supportsTemperature
            ? { temperature: GENERATION.TEMPERATURE }
            : {}),
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
