import { afterEach, expect, test, vi } from 'vitest';
import mongo from '../../examples/mongodb/sourced.config';
import { parseKitConfig } from '@/lib/kit/load-config';
import { getKitConfig, setCliKitConfig, resetKitConfigForTests } from '@/lib/kit/runtime-config';
import { resetEnvForTests } from '@/lib/env';
import { resolveEvalConfig } from '@/lib/eval/run';

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvForTests();
  resetKitConfigForTests();
});

test('FR-59 / FR-60 / D-64: kit models and judge default ignore demo environment overrides', () => {
  vi.stubEnv('CHAT_MODEL', 'demo-chat');
  vi.stubEnv('JUDGE_MODEL', 'demo-judge');
  vi.stubEnv('PRICE_CHAT_INPUT_PER_MTOK', '9');
  resetEnvForTests();
  setCliKitConfig(parseKitConfig(mongo));
  const config = getKitConfig(false);
  const { prices } = resolveEvalConfig(config);
  expect(config.models.chat.model).toBe('gpt-6-luna');
  expect(config.models.judge ?? config.models.chat).toEqual(config.models.chat);
  expect(prices).toEqual({
    chatInput: 0.1,
    chatOutput: 0.5,
    judgeInput: 0.1,
    judgeOutput: 0.5,
    embed: 0.02,
  });
});

test('FR-59 / D-64: demo overrides keep resolved model names and prices', () => {
  vi.stubEnv('CHAT_MODEL', 'ci-chat');
  vi.stubEnv('JUDGE_MODEL', 'ci-judge');
  for (const [key, value] of Object.entries({
    CHAT_INPUT: 1,
    CHAT_OUTPUT: 2,
    JUDGE_INPUT: 3,
    JUDGE_OUTPUT: 4,
    EMBED: 5,
  }))
    vi.stubEnv(`PRICE_${key}_PER_MTOK`, String(value));
  resetEnvForTests();
  setCliKitConfig({ ...parseKitConfig(mongo), profile: 'public-demo' });
  const config = getKitConfig(false);
  expect(config.models.chat.model).toBe('ci-chat');
  expect(config.models.judge?.model).toBe('ci-judge');
  expect(resolveEvalConfig(config).prices).toEqual({
    chatInput: 1,
    chatOutput: 2,
    judgeInput: 3,
    judgeOutput: 4,
    embed: 5,
  });
});

test('FR-59 / D-64: demo uses configuration when overrides are absent', () => {
  for (const key of [
    'CHAT_MODEL',
    'JUDGE_MODEL',
    'PRICE_CHAT_INPUT_PER_MTOK',
    'PRICE_CHAT_OUTPUT_PER_MTOK',
    'PRICE_JUDGE_INPUT_PER_MTOK',
    'PRICE_JUDGE_OUTPUT_PER_MTOK',
    'PRICE_EMBED_PER_MTOK',
  ])
    vi.stubEnv(key, undefined);
  resetEnvForTests();
  setCliKitConfig({ ...parseKitConfig(mongo), profile: 'public-demo' });
  expect(resolveEvalConfig(getKitConfig(false)).prices).toMatchObject({
    chatInput: 0.1,
    judgeInput: 0.1,
  });
});

test.each(['chat', 'judge', 'rerank', 'embed'] as const)(
  'D-112 / D-129: unknown %s requires yes and preserves known budget prices',
  (role) => {
    const config = parseKitConfig(mongo);
    config.models[role] = { ...config.models.embed, provider: 'openai', model: 'unpriced' };
    expect(() => resolveEvalConfig(config)).toThrow(
      'Price unknown for openai:unpriced; add it to pricing in sourced.config.ts to get an estimate.',
    );
    const resolved = resolveEvalConfig(config, true);
    expect(resolved.knownConfig.pricing['openai:unpriced']).toEqual({
      inputPerMTok: 0,
      outputPerMTok: 0,
    });
    expect(config.pricing['openai:unpriced']).toBeUndefined();
    if (role !== 'embed') expect(resolved.prices.embed).toBe(0.02);
  },
);

test('D-112: Ollama is free without confirmation', () => {
  const config = parseKitConfig(mongo);
  config.models.chat = { provider: 'ollama', model: 'local' };
  expect(resolveEvalConfig(config).prices).toMatchObject({ chatInput: 0, judgeInput: 0 });
});
