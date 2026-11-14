// UT-32 / TRD §31.1, §31.3: role resolution without provider network calls.
import { beforeEach, expect, test, vi } from 'vitest';
import { KitConfigSchema } from '@/lib/kit/config-schema';
import { getProviders } from '@/lib/llm';

const doubles = vi.hoisted(() => ({
  config: {},
  embedMany: vi.fn(),
  streamText: vi.fn(),
  env: { LLM_MODE: 'live', OPENAI_API_KEY: 'test-only-not-a-key' },
}));
vi.mock('@/lib/env', () => ({ getEnv: () => doubles.env, getConfigEnv: () => doubles.env }));
vi.mock('@/lib/kit/runtime-config', () => ({
  getKitConfig: () => KitConfigSchema.parse(doubles.config),
}));
vi.mock('ai', async (original) => ({
  ...(await original<typeof import('ai')>()),
  embedMany: doubles.embedMany,
  streamText: doubles.streamText,
}));
function config() {
  return KitConfigSchema.parse({
    schemaVersion: 1,
    corpus: { name: 'test', title: 'Test', description: 'Test corpus', language: 'en' },
    sources: [{ id: 'local', type: 'folder', path: 'fixtures' }],
    models: {
      chat: { provider: 'openai', model: 'chat-test' },
      embed: { provider: 'openai', model: 'text-embedding-3-large', dimensions: 3072 },
    },
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  doubles.config = config();
  doubles.env.LLM_MODE = 'live';
});
test('UT-32: omitted rerank, judge and generate resolve to the same chat provider', () => {
  const providers = getProviders();
  expect(providers.rerank).toBe(providers.chat);
  expect(providers.judge).toBe(providers.chat);
  expect(providers.generate).toBe(providers.chat);
});
test('UT-32: embed role uses its own model and configured dimensions', async () => {
  doubles.embedMany.mockResolvedValue({
    embeddings: [Array<number>(3072).fill(0)],
    usage: { tokens: 1 },
  });
  await getProviders().embed.embed(['text']);
  expect(doubles.embedMany).toHaveBeenCalledWith(
    expect.objectContaining({
      model: expect.objectContaining({ modelId: 'text-embedding-3-large' }) as unknown,
      providerOptions: { openai: { dimensions: 3072 } },
      maxRetries: 0,
    }),
  );
});
test('UT-32: explicit role models resolve independently', async () => {
  const value = config();
  value.models.rerank = { provider: 'openai', model: 'rerank-test' };
  value.models.judge = { provider: 'openai', model: 'judge-test' };
  value.models.generate = { provider: 'openai', model: 'generate-test' };
  doubles.config = value;
  doubles.streamText.mockImplementation(() => ({
    fullStream: (async function* () {
      yield await Promise.resolve({ type: 'text-delta', text: 'ok' });
    })(),
    usage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
  }));
  const providers = getProviders();
  for (const role of ['chat', 'rerank', 'judge', 'generate'] as const) {
    const stream = providers[role].streamText({
      model: role,
      system: 'test',
      prompt: 'test',
      maxOutputTokens: 1,
    });
    for await (const text of stream.textStream) expect(text).toBe('ok');
    expect(doubles.streamText).toHaveBeenLastCalledWith(
      expect.objectContaining({
        model: expect.objectContaining({ modelId: `${role}-test` }) as unknown,
      }),
    );
  }
});
test('UT-32: mock embedding dimensions follow configuration', async () => {
  doubles.env.LLM_MODE = 'mock';
  const result = await getProviders().embed.embed(['deterministic feature hashing']);
  expect(result.vectors[0]).toHaveLength(3072);
  expect(Math.hypot(...(result.vectors[0] ?? []))).toBeCloseTo(1);
});
