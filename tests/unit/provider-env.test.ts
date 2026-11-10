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
vi.mock('@/.sourced/config.json', () => ({ default: { config: configuration } }));
beforeEach(() => {
  vi.stubGlobal('SOURCED_NODE_RUNTIME', false);
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
