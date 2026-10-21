import 'server-only';
import { AppError } from '@/lib/errors';
import { featureHash } from './feature-hash';
import type { LlmProvider } from './types';

export const mockProvider: LlmProvider = {
  name: 'mock',
  embed(values, opts) {
    opts?.abortSignal?.throwIfAborted();
    const results = values.map(featureHash);
    return Promise.resolve({
      vectors: results.map((result) => result.vector),
      tokens: results.reduce((sum, result) => sum + result.tokens, 0),
    });
  },
  streamText() {
    throw new AppError('INTERNAL_ERROR', 'Mock generation is implemented in T-18.');
  },
  generateObject() {
    throw new AppError('INTERNAL_ERROR', 'Mock generation is implemented in T-18.');
  },
};
