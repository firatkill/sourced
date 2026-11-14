// TC-185 / UT-49 / FR-60 / TRD §5: credentials follow configured roles.
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import fs from 'node:fs';
import { getEnv, resetEnvForTests } from '@/lib/env';
const configuration = vi.hoisted(() => ({
  profile: 'local',
  models: {
    chat: { provider: 'ollama', model: 'llama3.2' },
    embed: { provider: 'ollama', model: 'nomic-embed-text', dimensions: 768 },
    judge: { provider: 'ollama', model: 'llama3.2' },
  },
}));
beforeEach(() => {
  vi.stubGlobal('SOURCED_NODE_RUNTIME', true);
  vi.spyOn(fs, 'readFileSync').mockImplementation(() => JSON.stringify({ config: configuration }));
  vi.stubEnv('LLM_MODE', 'live');
  for (const name of [
    'OPENAI_API_KEY',
    'GOOGLE_GENERATIVE_AI_API_KEY',
    'ANTHROPIC_API_KEY',
    'CHAT_MODEL',
    'PRICE_CHAT_INPUT_PER_MTOK',
    'PRICE_CHAT_OUTPUT_PER_MTOK',
    'PRICE_EMBED_PER_MTOK',
    'OLLAMA_BASE_URL',
  ])
    vi.stubEnv(name, '');
  for (const model of Object.values(configuration.models)) model.provider = 'ollama';
  resetEnvForTests();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetEnvForTests();
});
test('TC-185 / UT-49: local Ollama needs no key or demo model/price variables', () => {
  expect(getEnv().OLLAMA_BASE_URL).toBe('http://localhost:11434');
});
test('TC-185 / UT-49: mixed Gemini and Anthropic roles require only their keys', () => {
  configuration.models.chat.provider = 'anthropic';
  configuration.models.embed.provider = 'gemini';
  expect(() => getEnv()).toThrow('GOOGLE_GENERATIVE_AI_API_KEY');
  expect(() => getEnv()).toThrow('ANTHROPIC_API_KEY');
  expect(() => getEnv()).not.toThrow('OPENAI_API_KEY');
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic');
  vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'test-google');
  expect(getEnv().LLM_MODE).toBe('live');
});
test('TC-185 / UT-49: optional judge credentials are validated by its configured provider', () => {
  configuration.models.judge.provider = 'openai';
  expect(() => getEnv()).toThrow('OPENAI_API_KEY');
});
test('TC-185 / UT-49: Ollama URL supports Docker and rejects invalid input without disclosure', () => {
  vi.stubEnv('OLLAMA_BASE_URL', 'http://host.docker.internal:11434');
  expect(getEnv().OLLAMA_BASE_URL).toBe('http://host.docker.internal:11434');
  resetEnvForTests();
  vi.stubEnv('OLLAMA_BASE_URL', 'private-invalid-value');
  expect(() => getEnv()).toThrow('OLLAMA_BASE_URL');
  expect(() => getEnv()).not.toThrow('private-invalid-value');
});

test('TC-185 / UT-49: Node validates the runtime snapshot rather than the bundled build snapshot', () => {
  vi.stubGlobal('SOURCED_NODE_RUNTIME', true);
  const read = vi
    .spyOn(fs, 'readFileSync')
    .mockReturnValue(JSON.stringify({ config: configuration }));
  expect(getEnv().OLLAMA_BASE_URL).toBe('http://localhost:11434');
  expect(read).toHaveBeenCalledWith('.sourced/config.json', 'utf8');
});

// Fresh-clone regression requirements 1–2; TRD §5 / FR-60.
test.each(['missing', 'edge', 'no-filesystem'] as const)(
  'fresh clone: %s fallback preserves demo live credentials',
  (runtime) => {
    if (runtime === 'missing')
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      });
    if (runtime === 'edge') vi.stubGlobal('SOURCED_NODE_RUNTIME', false);
    if (runtime === 'no-filesystem')
      vi.stubGlobal('process', { ...process, getBuiltinModule: undefined });
    for (const name of [
      'OPENAI_API_KEY',
      'CHAT_MODEL',
      'PRICE_CHAT_INPUT_PER_MTOK',
      'PRICE_CHAT_OUTPUT_PER_MTOK',
      'PRICE_EMBED_PER_MTOK',
    ])
      expect(() => getEnv()).toThrow(name);
    vi.stubEnv('OPENAI_API_KEY', 'test-placeholder');
    vi.stubEnv('CHAT_MODEL', 'test-chat');
    vi.stubEnv('PRICE_CHAT_INPUT_PER_MTOK', '0');
    vi.stubEnv('PRICE_CHAT_OUTPUT_PER_MTOK', '0');
    vi.stubEnv('PRICE_EMBED_PER_MTOK', '0');
    expect(getEnv().LLM_MODE).toBe('live');
  },
);
test('fresh clone: corrupt snapshots do not silently fall back', () => {
  vi.mocked(fs.readFileSync).mockReturnValue('invalid json');
  expect(() => getEnv()).toThrow();
});

// TC-190 / FR-64 / TRD §38: startup validation, access flow deferred to T-74.
test.each(['', 'too-short', 'x'.repeat(23)])(
  'TC-190: private rejects a missing or short access token',
  (token) => {
    configuration.profile = 'private';
    vi.stubEnv('LLM_MODE', 'mock');
    vi.stubEnv('SOURCED_ACCESS_TOKEN', token);
    expect(() => getEnv()).toThrow('SOURCED_ACCESS_TOKEN');
    configuration.profile = 'local';
  },
);
test.each(['local', 'private', 'public-demo'])(
  'TC-190: %s validates only its profile credentials',
  (profile) => {
    configuration.profile = profile;
    vi.stubEnv('LLM_MODE', 'mock');
    vi.stubEnv('IP_HASH_SALT', '');
    vi.stubEnv(
      'SOURCED_ACCESS_TOKEN',
      profile === 'private' ? 'test-only-access-token-00000000' : '',
    );
    if (profile === 'public-demo') expect(() => getEnv()).toThrow('IP_HASH_SALT');
    else expect(getEnv().LLM_MODE).toBe('mock');
    configuration.profile = 'local';
  },
);
