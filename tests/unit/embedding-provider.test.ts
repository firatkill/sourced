import { expect, test, vi } from 'vitest';
import { EMBEDDING } from '@/lib/config';
import { openaiProvider } from '@/lib/llm/openai';
import { getProvider } from '@/lib/llm';

const doubles = vi.hoisted(() => ({
  embedMany: vi.fn(),
  env: { LLM_MODE: 'mock', OPENAI_API_KEY: 'test-only-not-a-key' },
}));
vi.mock('ai', () => ({ embedMany: doubles.embedMany }));
vi.mock('@/lib/env', () => ({ getEnv: () => doubles.env }));

test('TC-043: OpenAI adapter pins dimensions, disables SDK retries and maps usage', async () => {
  const vectors = [Array<number>(EMBEDDING.DIMENSIONS).fill(0)];
  doubles.embedMany.mockResolvedValue({ embeddings: vectors, usage: { tokens: 4 } });
  const signal = new AbortController().signal;
  await expect(openaiProvider.embed(['test'], { abortSignal: signal })).resolves.toEqual({
    vectors,
    tokens: 4,
  });
  const args: unknown = doubles.embedMany.mock.calls[0]?.[0];
  expect(args).toMatchObject({
    model: { modelId: EMBEDDING.MODEL },
    values: ['test'],
    providerOptions: { openai: { dimensions: EMBEDDING.DIMENSIONS } },
    maxRetries: 0,
    abortSignal: signal,
  });
  expect(getProvider().name).toBe('mock');
  doubles.env.LLM_MODE = 'live';
  try {
    expect(getProvider()).toBe(openaiProvider);
  } finally {
    doubles.env.LLM_MODE = 'mock';
  }
});
