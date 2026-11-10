// UT-32 / FR-59–62: normative schema, snapshots, role defaults and capability bounds.
import { afterEach, expect, test, vi } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { KitConfigSchema } from '@/lib/kit/config-schema';
import { canonicalJson, configHash, parseKitConfig, loadConfig } from '@/lib/kit/load-config';
import { readSnapshot } from '@/lib/kit/runtime-config';
import { ftsConfig } from '@/lib/kit/fts';
import { modelCapabilities } from '@/lib/llm/models';
import { resetEnvForTests } from '@/lib/env';

export const minimal = () => ({
  schemaVersion: 1,
  corpus: { name: 'test', title: 'Test', description: 'A test corpus', language: 'en' },
  sources: [{ id: 'test', type: 'folder', path: './fixture' }],
  models: {
    chat: { provider: 'mock', model: 'mock' },
    embed: { provider: 'mock', model: 'mock-feature-hash', dimensions: 768 },
  },
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvForTests();
});
test('UT-32: nested defaults are applied (D-97)', () => {
  const config = parseKitConfig(minimal());
  expect(config.sources[0]?.html).toEqual({ preset: 'generic', removeSelectors: [] });
  expect(config.copy).toEqual({ suggested: [] });
  expect(config.overrides).toEqual({ chunking: {}, retrieval: {}, contextualEmbedding: true });
  expect(config.profile).toBe('local');
});
test.each([
  ['schemaVersion', { schemaVersion: 2 }],
  ['sources', { sources: [] }],
  ['sources.1.id', { sources: [...minimal().sources, ...minimal().sources] }],
  ['overrides.chunking', { overrides: { chunking: { minTokens: 199 } } }],
  ['overrides.chunking', { overrides: { chunking: { targetTokens: 800 } } }],
  ['overrides.chunking', { overrides: { chunking: { maxTokens: 1501 } } }],
  ['overrides.chunking.overlapTokens', { overrides: { chunking: { overlapTokens: 126 } } }],
  ['overrides.retrieval.vectorCandidates', { overrides: { retrieval: { vectorCandidates: 9 } } }],
  ['overrides.retrieval.ftsCandidates', { overrides: { retrieval: { ftsCandidates: 201 } } }],
  ['overrides.retrieval.rerankCandidates', { overrides: { retrieval: { rerankCandidates: 5 } } }],
  ['overrides.retrieval.rerankCandidates', { overrides: { retrieval: { rerankCandidates: 51 } } }],
  ['overrides.retrieval.finalPassages', { overrides: { retrieval: { finalPassages: 10 } } }],
  ['copy.suggested', { profile: 'public-demo' }],
])('UT-32: invalid %s names the field and fix', (field, patch) => {
  expect(() => parseKitConfig({ ...minimal(), ...patch })).toThrow(field);
});
test.each(['openai', 'gemini', 'ollama', 'mock'])('UT-32: embed provider %s', (provider) => {
  const model =
    provider === 'openai'
      ? 'text-embedding-3-small'
      : provider === 'gemini'
        ? 'gemini-embedding-001'
        : 'local';
  expect(
    KitConfigSchema.safeParse({
      ...minimal(),
      models: { ...minimal().models, embed: { provider, model, dimensions: 768 } },
    }).success,
  ).toBe(true);
});
test('UT-32: chat-only provider is rejected for embeddings with supported alternatives', () => {
  expect(() =>
    parseKitConfig({
      ...minimal(),
      models: {
        ...minimal().models,
        embed: { provider: 'anthropic', model: 'x', dimensions: 768 },
      },
    }),
  ).toThrow(/openai.*gemini.*ollama.*mock/);
});
test.each([
  ['openai', 'text-embedding-3-small', 1537],
  ['gemini', 'gemini-embedding-001', 127],
  ['openai', 'unknown', 768],
  ['mock', 'mock', 4001],
])('UT-32: embedding dimensions %s %s %i rejected', (provider, model, dimensions) => {
  expect(() =>
    parseKitConfig({
      ...minimal(),
      models: { ...minimal().models, embed: { provider, model, dimensions } },
    }),
  ).toThrow('models.embed.dimensions');
});
test.each(['NODE_ENV', 'VERCEL_ENV'])('UT-32: %s production rejects mock', (key) => {
  vi.stubEnv(key, 'production');
  vi.stubEnv('LLM_MODE', 'live');
  vi.stubEnv('OPENAI_API_KEY', 'test-only-not-a-key');
  vi.stubEnv('CHAT_MODEL', 'test-chat');
  for (const price of [
    'PRICE_CHAT_INPUT_PER_MTOK',
    'PRICE_CHAT_OUTPUT_PER_MTOK',
    'PRICE_EMBED_PER_MTOK',
  ])
    vi.stubEnv(price, '0');
  resetEnvForTests();
  expect(() => parseKitConfig(minimal())).toThrow('models.chat.provider');
});
test('UT-32: public demo requires prices for inherited and explicit roles', () => {
  const value = {
    ...minimal(),
    profile: 'public-demo',
    copy: { suggested: [{ id: 'one', text: 'A question?' }] },
  };
  expect(() => parseKitConfig(value)).toThrow('pricing.mock:mock');
  expect(
    parseKitConfig({
      ...value,
      pricing: { 'mock:mock': { inputPerMTok: 0 }, 'mock:mock-feature-hash': { inputPerMTok: 0 } },
    }).profile,
  ).toBe('public-demo');
});
test('UT-32: known language map and fallback', () => {
  expect(
    ['en', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'tr', 'ru', 'sv', 'da', 'no', 'fi', 'hu', 'ro'].map(
      ftsConfig,
    ),
  ).toEqual([
    'english',
    'german',
    'french',
    'spanish',
    'italian',
    'portuguese',
    'dutch',
    'turkish',
    'russian',
    'swedish',
    'danish',
    'norwegian',
    'finnish',
    'hungarian',
    'romanian',
  ]);
  expect(ftsConfig('ja')).toBe('simple');
});
test('UT-32: canonical hash ignores object ordering, preserves arrays', () => {
  expect(configHash({ b: 2, a: 1 })).toBe(configHash({ a: 1, b: 2 }));
  expect(canonicalJson({ a: undefined, b: [2, 1] })).toBe('{"b":[2,1]}');
  expect(configHash([1, 2])).not.toBe(configHash([2, 1]));
});
test('UT-32: snapshot validates hash and reports missing snapshot', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'sourced-config-'));
  const filename = path.join(dir, 'config.json');
  try {
    expect(() => readSnapshot(filename)).toThrow('Run ./sourced init first.');
    const config = parseKitConfig(minimal());
    const snapshot = {
      schemaVersion: 1,
      configHash: configHash(config),
      writtenAt: new Date().toISOString(),
      config,
    };
    await writeFile(filename, JSON.stringify(snapshot));
    expect(readSnapshot(filename)).toEqual(config);
    await writeFile(filename, JSON.stringify({ ...snapshot, configHash: '0'.repeat(64) }));
    expect(() => readSnapshot(filename)).toThrow('configHash');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('UT-32 / A-17: model bounds and unknown chat capabilities', () => {
  expect(modelCapabilities('openai', 'text-embedding-3-large').embedDimensions).toContain(3072);
  expect(modelCapabilities('openai', 'text-embedding-3-small').embedDimensions).not.toContain(1537);
  expect(modelCapabilities('custom', 'unknown')).toEqual({
    supportsTemperature: true,
    reasoning: false,
  });
});

test('UT-32: loader writes a validated snapshot and outside mounts', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'sourced-loader-'));
  try {
    const value = minimal();
    value.sources[0]!.path = '/tmp/external-corpus';
    await writeFile(
      path.join(root, 'sourced.config.ts'),
      `export default ${JSON.stringify(value)};`,
    );
    const config = await loadConfig(root);
    expect(readSnapshot(path.join(root, '.sourced/config.json'))).toEqual(config);
    const { readFile } = await import('node:fs/promises');
    expect(await readFile(path.join(root, '.sourced/mounts'), 'utf8')).toBe('/tmp/external-corpus');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('UT-32: missing embedding provider lists supported alternatives', () => {
  expect(() =>
    parseKitConfig({
      ...minimal(),
      models: { chat: { provider: 'anthropic', model: 'chat-only' } },
    }),
  ).toThrow('openai, gemini, ollama, mock');
});
test.each([
  { id: 'urls', type: 'urls', urls: ['https://example.test/docs'] },
  { id: 'sitemap', type: 'sitemap', url: 'https://example.test/sitemap.xml' },
  { id: 'crawl', type: 'crawl', root: 'https://example.test' },
  { id: 'git', type: 'git', path: '../repository' },
])('UT-32: source schema accepts $type with defaults', (source) => {
  expect(parseKitConfig({ ...minimal(), sources: [source] }).sources[0]?.type).toBe(source.type);
});
