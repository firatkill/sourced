import { setTimeout } from 'node:timers/promises';
import { z } from 'zod';
import { EMBEDDING } from '@/lib/config';
import { AppError } from '@/lib/errors';
import { getProvider } from '@/lib/llm';
import type { LlmProvider } from '@/lib/llm/types';

const resultSchema = z.object({
  vectors: z.array(z.array(z.number()).length(EMBEDDING.DIMENSIONS)),
  tokens: z.number().int().nonnegative(),
});
const failureSchema = z.object({
  statusCode: z.number().optional(),
  responseHeaders: z.record(z.string(), z.string()).optional(),
});
type Options = {
  provider?: Pick<LlmProvider, 'embed'>;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
};

export async function embedBatches(
  inputs: string[],
  options: Options = {},
): Promise<{ vectors: number[][]; tokens: number }> {
  const provider = options.provider ?? getProvider();
  const sleep = options.sleep ?? ((ms) => setTimeout(ms));
  const random = options.random ?? Math.random;
  const now = options.now ?? Date.now;
  const batches: string[][] = [];
  for (let start = 0; start < inputs.length; start += EMBEDDING.BATCH_SIZE)
    batches.push(inputs.slice(start, start + EMBEDDING.BATCH_SIZE));
  const results: { vectors: number[][]; tokens: number }[] = [];
  let cursor = 0;
  let failed = false;
  const run = async (values: string[]) => {
    for (let attempt = 0; ; attempt++) {
      let response: Awaited<ReturnType<LlmProvider['embed']>>;
      try {
        response = await provider.embed(values, {
          abortSignal: AbortSignal.timeout(EMBEDDING.BATCH_TIMEOUT_MS),
        });
      } catch (error) {
        const failure = failureSchema.safeParse(error);
        const status = failure.success ? failure.data.statusCode : undefined;
        const transient =
          status === 429 ||
          (status !== undefined && status >= 500) ||
          (status === undefined && !(error instanceof AppError));
        if (!transient || attempt >= EMBEDDING.MAX_RETRIES)
          throw new AppError('PROVIDER_ERROR', 'Embedding request failed.', { cause: error });
        const header = failure.success ? failure.data.responseHeaders?.['retry-after'] : undefined;
        const retryAfter =
          header === undefined
            ? 0
            : /^\d+(\.\d+)?$/.test(header)
              ? Number(header) * 1000
              : Math.max(0, Date.parse(header) - now()) || 0;
        const delay =
          Math.min(EMBEDDING.MAX_DELAY_MS, EMBEDDING.BASE_DELAY_MS * 2 ** attempt) *
          (0.5 + random() * 0.5);
        await sleep(Math.max(delay, retryAfter));
        continue;
      }
      const result = resultSchema.safeParse(response);
      if (!result.success || result.data.vectors.length !== values.length)
        throw new AppError('PROVIDER_ERROR', 'Invalid embedding response.');
      return result.data;
    }
  };
  const worker = async () => {
    while (!failed) {
      const index = cursor++;
      const batch = batches[index];
      if (!batch) return;
      try {
        results[index] = await run(batch);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(EMBEDDING.CONCURRENCY, batches.length) }, worker),
  );
  return {
    vectors: results.flatMap((result) => result.vectors),
    tokens: results.reduce((sum, result) => sum + result.tokens, 0),
  };
}
