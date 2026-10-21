import 'server-only';
import { getEnv } from '@/lib/env';
import { mockProvider } from './mock';
import { openaiProvider } from './openai';
import type { LlmProvider } from './types';

export function getProvider(): LlmProvider {
  return getEnv().LLM_MODE === 'mock' ? mockProvider : openaiProvider;
}
