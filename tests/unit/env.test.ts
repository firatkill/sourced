import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getEnv, resetEnvForTests } from '@/lib/env';

const example = parseEnv(readFileSync('.env.example', 'utf8'));
const original = { ...process.env };
beforeEach(() => {
  process.env = { ...example, NODE_ENV: 'test', LLM_MODE: 'mock' };
  resetEnvForTests();
});
afterEach(() => {
  process.env = { ...original };
  resetEnvForTests();
  vi.unstubAllEnvs();
});

describe('UT-17: env boundaries (TRD §5)', () => {
  it('TC-004: unedited example works in mock mode without a key', () => {
    const env = getEnv();
    expect(env.LLM_MODE).toBe('mock');
    expect(env.CHAT_MODEL).toBe('mock');
    expect(env.JUDGE_MODEL).toBe('mock');
    expect(env.STORE_QUESTIONS).toBe(false);
    expect(env.RATE_LIMIT_IP_DAILY).toBe(10);
    expect(env.RATE_LIMIT_GLOBAL_DAILY).toBe(300);
    expect(env.DATABASE_URL).toContain('localhost:5433/sourced');
    expect(getEnv()).toBe(env);
  });
  it('TC-005: live errors list every missing name, never supplied values', () => {
    process.env.LLM_MODE = 'live';
    delete process.env.OPENAI_API_KEY;
    delete process.env.CHAT_MODEL;
    delete process.env.PRICE_CHAT_INPUT_PER_MTOK;
    delete process.env.PRICE_CHAT_OUTPUT_PER_MTOK;
    delete process.env.PRICE_EMBED_PER_MTOK;
    process.env.IP_HASH_SALT = 'private-invalid';
    expect(() => getEnv()).toThrow(/OPENAI_API_KEY/);
    try {
      getEnv();
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      const message = error instanceof Error ? error.message : '';
      for (const name of [
        'CHAT_MODEL',
        'PRICE_CHAT_INPUT_PER_MTOK',
        'PRICE_CHAT_OUTPUT_PER_MTOK',
        'PRICE_EMBED_PER_MTOK',
        'IP_HASH_SALT',
      ])
        expect(message).toContain(name);
      expect(message).not.toContain('private-invalid');
    }
  });
  it('TC-006: mock is rejected in Vercel production', () => {
    process.env.VERCEL_ENV = 'production';
    expect(() => getEnv()).toThrow(/LLM_MODE/);
  });
  it('TC-007: example documents every TRD environment variable', () => {
    const trd = readFileSync('docs/TRD.md', 'utf8')
      .split('## 5. Environment variables')[1]
      ?.split('## 6.')[0];
    expect(trd).toBeDefined();
    const names = [...(trd ?? '').matchAll(/^\| (`[^|]+) \|/gm)].flatMap((m) =>
      [...(m[1] ?? '').matchAll(/`([A-Z][A-Z0-9_]*)`/g)].map((n) => n[1]),
    );
    const text = readFileSync('.env.example', 'utf8');
    expect(names.length).toBeGreaterThan(30);
    for (const name of names.filter((name): name is string => typeof name === 'string'))
      expect(text).toMatch(new RegExp(`^#?\\s*${name}=`, 'm'));
  });
  it.each([
    ['DATABASE_POOL_MAX', '0'],
    ['RATE_LIMIT_IP_DAILY', '1.5'],
    ['MAX_OUTPUT_TOKENS', '199'],
    ['MAX_OUTPUT_TOKENS', '2001'],
    ['MOCK_STREAM_DELAY_MS', '-1'],
    ['PRICE_CHAT_INPUT_PER_MTOK', '-0.01'],
    ['STORE_QUESTIONS', 'yes'],
    ['EVAL_MAX_COST_USD', '0'],
  ])('TC-007: rejects invalid %s', (name, value) => {
    process.env[name] = value;
    expect(() => getEnv()).toThrow(name);
  });
  it('TC-007: default values, decimals, zero delay and explicit true', () => {
    delete process.env.DATABASE_POOL_MAX;
    delete process.env.MAX_OUTPUT_TOKENS;
    process.env.STORE_QUESTIONS = 'true';
    process.env.MOCK_STREAM_DELAY_MS = '0';
    process.env.PRICE_CHAT_INPUT_PER_MTOK = '0.25';
    expect(getEnv()).toMatchObject({
      DATABASE_POOL_MAX: 5,
      MAX_OUTPUT_TOKENS: 700,
      STORE_QUESTIONS: true,
      MOCK_STREAM_DELAY_MS: 0,
      PRICE_CHAT_INPUT_PER_MTOK: 0.25,
    });
  });
  it('TC-005: live requires chat credentials but not judge credentials', () => {
    Object.assign(process.env, {
      LLM_MODE: 'live',
      OPENAI_API_KEY: 'test-placeholder',
      CHAT_MODEL: 'test-chat',
      PRICE_CHAT_INPUT_PER_MTOK: '0',
      PRICE_CHAT_OUTPUT_PER_MTOK: '0',
      PRICE_EMBED_PER_MTOK: '0',
    });
    delete process.env.JUDGE_MODEL;
    expect(getEnv().CHAT_MODEL).toBe('test-chat');
  });
});
