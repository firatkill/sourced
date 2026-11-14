// UT-32 / TRD §28.2, §29.3–29.4: snapshots do not require runtime credentials.
import { afterEach, beforeEach, expect, test } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import example from '@/sourced.config';
import { getConfigEnv, getEnv, resetEnvForTests } from '@/lib/env';
import { loadConfig, parseKitConfig } from '@/lib/kit/load-config';
import { getKitConfig, readSnapshot, resetKitConfigForTests } from '@/lib/kit/runtime-config';

const original = { ...process.env };
beforeEach(() => {
  // Deliberately omit database, salts, provider keys, site URL and all overrides.
  process.env = { NODE_ENV: 'test' };
  resetEnvForTests();
  resetKitConfigForTests();
});
afterEach(() => {
  process.env = { ...original };
  resetEnvForTests();
  resetKitConfigForTests();
});

test('UT-32: snapshot generation and reading work without runtime environment or .env.local', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'sourced-no-runtime-env-'));
  try {
    process.env.DATABASE_URL = '';
    await writeFile(
      path.join(root, 'sourced.config.ts'),
      `export default ${JSON.stringify(example)};`,
    );
    const config = await loadConfig(root);
    expect(readSnapshot(path.join(root, '.sourced/config.json'))).toEqual(config);
    expect(JSON.parse(await readFile(path.join(root, '.sourced/copy.json'), 'utf8'))).toMatchObject(
      { hero: config.copy.hero },
    );
    expect(() => getEnv()).toThrow('DATABASE_URL');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('UT-32: absent overrides preserve configured models and nonzero prices', () => {
  const config = getKitConfig();
  expect(config.models).toEqual(parseKitConfig(example).models);
  expect(config.pricing).toEqual(parseKitConfig(example).pricing);
  expect(getConfigEnv()).toEqual({ NODE_ENV: 'test', LLM_MODE: 'live' });
});

test('UT-32: optional overrides work without a database or provider key', () => {
  Object.assign(process.env, {
    CHAT_MODEL: 'configured-chat-override',
    JUDGE_MODEL: 'configured-judge-override',
    PRICE_CHAT_INPUT_PER_MTOK: '0',
    PRICE_CHAT_OUTPUT_PER_MTOK: '0.25',
    PRICE_JUDGE_INPUT_PER_MTOK: '0.5',
    PRICE_JUDGE_OUTPUT_PER_MTOK: '1',
    PRICE_EMBED_PER_MTOK: '0.01',
  });
  const config = getKitConfig();
  expect(config.models.chat.model).toBe('configured-chat-override');
  expect(config.models.judge?.model).toBe('configured-judge-override');
  expect(config.pricing['openai:configured-chat-override']).toEqual({
    inputPerMTok: 0,
    outputPerMTok: 0.25,
  });
  expect(config.pricing['openai:configured-judge-override']).toEqual({
    inputPerMTok: 0.5,
    outputPerMTok: 1,
  });
  expect(config.pricing['openai:text-embedding-3-small']).toEqual({
    inputPerMTok: 0.01,
    outputPerMTok: 0,
  });
  expect(() => getEnv()).toThrow('DATABASE_URL');
});

test('UT-32: partial and empty overrides preserve the other configured values', () => {
  process.env.CHAT_MODEL = '';
  process.env.PRICE_CHAT_INPUT_PER_MTOK = '';
  process.env.PRICE_CHAT_OUTPUT_PER_MTOK = '0';
  const config = getKitConfig();
  expect(config.models.chat.model).toBe(example.models.chat.model);
  expect(config.pricing['openai:gpt-6-luna']).toEqual({ inputPerMTok: 0.1, outputPerMTok: 0 });
});

test('UT-32: malformed optional overrides fail with names, not supplied values', () => {
  process.env.PRICE_CHAT_INPUT_PER_MTOK = 'invalid-private-value';
  expect(() => getConfigEnv()).toThrow('PRICE_CHAT_INPUT_PER_MTOK');
  expect(() => getConfigEnv()).not.toThrow('invalid-private-value');
});

test.each(['NODE_ENV', 'VERCEL_ENV'])(
  'UT-32: %s production still rejects a mock config without runtime credentials',
  (name) => {
    process.env[name] = 'production';
    expect(() =>
      parseKitConfig({
        ...example,
        models: { ...example.models, chat: { provider: 'mock', model: 'mock' } },
      }),
    ).toThrow('models.chat.provider');
  },
);

test('UT-32: runtime mock override remains forbidden in Vercel production', () => {
  process.env.VERCEL_ENV = 'production';
  process.env.LLM_MODE = 'mock';
  expect(() => getConfigEnv()).toThrow('LLM_MODE');
});
