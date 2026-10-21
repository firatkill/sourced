import 'server-only';
import { createOpenAI } from '@ai-sdk/openai';
import { embedMany } from 'ai';
import { EMBEDDING } from '@/lib/config';
import { getEnv } from '@/lib/env';
import { AppError } from '@/lib/errors';
import type { LlmProvider } from './types';

export const openaiProvider: LlmProvider = {
  name: 'openai',
  async embed(values, opts) {
    const apiKey = getEnv().OPENAI_API_KEY;
    if (!apiKey) throw new AppError('PROVIDER_ERROR', 'OpenAI API key is not configured.');
    const openai = createOpenAI({ apiKey });
    // A-05 / embedding portion of A-11: verified against installed AI SDK 7 source.
    const result = await embedMany({
      model: openai.embedding(EMBEDDING.MODEL),
      values,
      providerOptions: { openai: { dimensions: EMBEDDING.DIMENSIONS } },
      maxRetries: 0,
      ...(opts?.abortSignal ? { abortSignal: opts.abortSignal } : {}),
    });
    return { vectors: result.embeddings, tokens: result.usage.tokens };
  },
  streamText() {
    throw new AppError('INTERNAL_ERROR', 'Live generation is implemented in T-18.');
  },
  generateObject() {
    throw new AppError('INTERNAL_ERROR', 'Live generation is implemented in T-18.');
  },
};
