import { setTimeout } from 'node:timers/promises';
import { z } from 'zod';
import { getKitConfig } from '@/lib/kit/runtime-config';
import { EMBEDDING } from '@/lib/config';
import { AppError, PROVIDER_ERROR_MESSAGE, PROVIDER_TIMEOUT_MESSAGE } from '@/lib/errors';
import { getProviders } from '@/lib/llm';

const responseSchema = () =>
  z.object({
    vectors: z.tuple([z.array(z.number()).length(getKitConfig().models.embed.dimensions)]),
    tokens: z.number().int().nonnegative(),
  });
const failureSchema = z.object({
  statusCode: z.number().optional(),
  isRetryable: z.boolean().optional(),
  code: z.string().optional(),
});

/** TRD §9.1: embed the unmodified question, with one transient-error retry. */
export async function embedQuery(question: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const timeout = AbortSignal.timeout(EMBEDDING.QUERY_TIMEOUT_MS);
  const abortSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  for (let attempt = 0; ; attempt++) {
    try {
      abortSignal.throwIfAborted();
      const response = await getProviders().embed.embed([question], { abortSignal });
      abortSignal.throwIfAborted();
      const { vectors, tokens } = responseSchema().parse(response);
      return { vector: vectors[0], tokens };
    } catch (error) {
      signal?.throwIfAborted();
      if (
        timeout.aborted ||
        (error instanceof AppError && error.code === 'PROVIDER_TIMEOUT') ||
        (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name))
      ) {
        throw new AppError('PROVIDER_TIMEOUT', PROVIDER_TIMEOUT_MESSAGE, { cause: error });
      }
      const failure = failureSchema.safeParse(error);
      const status = failure.success ? failure.data.statusCode : undefined;
      const transient =
        status === 429 ||
        (status !== undefined && status >= 500 && status < 600) ||
        (status === undefined &&
          (error instanceof TypeError ||
            (failure.success &&
              (failure.data.isRetryable === true ||
                ['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT'].includes(
                  failure.data.code ?? '',
                )))));
      if (attempt > 0 || !transient) {
        throw new AppError('PROVIDER_ERROR', PROVIDER_ERROR_MESSAGE, { cause: error });
      }
      try {
        await setTimeout(300, undefined, { signal: abortSignal });
      } catch (cause) {
        signal?.throwIfAborted();
        throw new AppError('PROVIDER_TIMEOUT', PROVIDER_TIMEOUT_MESSAGE, { cause });
      }
    }
  }
}
