import { afterEach, expect, test, vi } from 'vitest';
import { estimateCost, totalUsage, type AnswerUsage } from '@/lib/cost/estimate';
import { resetEnvForTests } from '@/lib/env';

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvForTests();
});
const usage: AnswerUsage = {
  embeddingTokens: 100,
  rerank: { inputTokens: 3000, outputTokens: 80 },
  generation: { inputTokens: 4000, outputTokens: 600 },
  fallback: { inputTokens: 0, outputTokens: 0 },
};

test('TC-077 / UT-16: FR-31 formula uses env prices and zero fallback tokens', () => {
  vi.stubEnv('PRICE_EMBED_PER_MTOK', '0.02');
  vi.stubEnv('PRICE_CHAT_INPUT_PER_MTOK', '0.15');
  vi.stubEnv('PRICE_CHAT_OUTPUT_PER_MTOK', '0.6');
  resetEnvForTests();
  expect(estimateCost(usage)).toBeCloseTo((100 * 0.02 + 7000 * 0.15 + 680 * 0.6) / 1_000_000, 12);
  const withFallback = { ...usage, fallback: { inputTokens: 4500, outputTokens: 200 } };
  expect(estimateCost(withFallback)).toBeCloseTo(
    (100 * 0.02 + 11500 * 0.15 + 880 * 0.6) / 1_000_000,
    12,
  );
});

test('TC-077 / UT-16: separately reported reasoning tokens are billed as output', () => {
  vi.stubEnv('PRICE_CHAT_OUTPUT_PER_MTOK', '2');
  vi.stubEnv('PRICE_CHAT_INPUT_PER_MTOK', '0');
  vi.stubEnv('PRICE_EMBED_PER_MTOK', '0');
  resetEnvForTests();
  const detailed = {
    ...usage,
    generation: { ...usage.generation, reasoningTokens: 120 },
    fallback: { inputTokens: 40, outputTokens: 20, reasoningTokens: 10 },
  };
  expect(totalUsage(detailed)).toEqual({
    embeddingTokens: 100,
    inputTokens: 7040,
    outputTokens: 830,
  });
  expect(estimateCost(detailed)).toBe((830 * 2) / 1_000_000);
});

test('TC-185 / UT-49 / TRD §31.4: each role uses configured prices, missing prices stay unknown, Ollama is free', async () => {
  const { parseKitConfig } = await import('@/lib/kit/load-config');
  const { rolePrice } = await import('@/lib/cost/estimate');
  const config = parseKitConfig({
    schemaVersion: 1,
    corpus: { name: 'test', title: 'Test', description: 'Test', language: 'en' },
    sources: [{ id: 'test', type: 'folder', path: '.' }],
    models: {
      chat: { provider: 'anthropic', model: 'chat' },
      rerank: { provider: 'gemini', model: 'rerank' },
      embed: { provider: 'gemini', model: 'gemini-embedding-2', dimensions: 768 },
    },
    pricing: {
      'anthropic:chat': { inputPerMTok: 2, outputPerMTok: 4 },
      'gemini:rerank': { inputPerMTok: 1, outputPerMTok: 3 },
      'gemini:gemini-embedding-2': { inputPerMTok: 0.1 },
    },
  });
  vi.stubEnv('PRICE_CHAT_INPUT_PER_MTOK', '999');
  expect(estimateCost(usage, config)).toBe(
    (100 * 0.1 + 3000 + 80 * 3 + 4000 * 2 + 600 * 4) / 1_000_000,
  );
  expect(rolePrice('judge', config)).toEqual(config.pricing['anthropic:chat']);
  for (const key of Object.keys(config.pricing)) {
    const missing = structuredClone(config);
    missing.pricing = Object.fromEntries(
      Object.entries(missing.pricing).filter(([name]) => name !== key),
    );
    expect(estimateCost(usage, missing)).toBeNull();
  }
  config.models.chat = { provider: 'ollama', model: 'local-chat' };
  config.models.rerank = { provider: 'ollama', model: 'local-rerank' };
  config.models.embed = { provider: 'ollama', model: 'local-embed', dimensions: 768 };
  config.pricing = { 'ollama:local-chat': { inputPerMTok: 99, outputPerMTok: 99 } };
  expect(estimateCost(usage, config)).toBe(0);
});
