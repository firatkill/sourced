// TC-185 / UT-49 / FR-60: real SDKs, injected transports, no network.
import { afterEach, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { createGeminiProvider } from '@/lib/llm/gemini';
import { createAnthropicProvider } from '@/lib/llm/anthropic';
import { createOllamaProvider } from '@/lib/llm/ollama';
import { getProviders, isInvalidOutput } from '@/lib/llm';
import { parseKitConfig } from '@/lib/kit/load-config';
import { modelCapabilities } from '@/lib/llm/models';
import * as capabilities from '@/lib/llm/models';
import { GENERATION } from '@/lib/config';

const env = vi.hoisted(() => ({
  LLM_MODE: 'live',
  GOOGLE_GENERATIVE_AI_API_KEY: 'test-google',
  ANTHROPIC_API_KEY: 'test-anthropic',
  OLLAMA_BASE_URL: 'http://localhost:11434/',
}));
const config = vi.hoisted(() => ({
  schemaVersion: 1,
  corpus: { name: 'test', title: 'Test', description: 'Test', language: 'en' },
  sources: [{ id: 'test', type: 'folder', path: '.' }],
  models: {
    chat: { provider: 'anthropic', model: 'claude-sonnet-5-5' },
    rerank: { provider: 'gemini', model: 'gemini-2.5-flash' },
    embed: { provider: 'ollama', model: 'nomic-embed-text', dimensions: 768 },
  },
}));
vi.mock('@/lib/env', () => ({ getEnv: () => env, getConfigEnv: () => env }));
vi.mock('@/lib/kit/runtime-config', () => ({ getKitConfig: () => parseKitConfig(config) }));
afterEach(() => vi.restoreAllMocks());
const request = {
  model: 'chat' as const,
  system: 'System',
  prompt: 'Return JSON with ok true.',
  maxOutputTokens: 123,
};
const schema = z.object({ ok: z.boolean() });
const factories = {
  gemini: (fetch: typeof globalThis.fetch) =>
    createGeminiProvider(
      'gemini-2.5-flash',
      { model: 'gemini-embedding-2', dimensions: 768 },
      fetch,
    ),
  anthropic: (fetch: typeof globalThis.fetch) =>
    createAnthropicProvider('claude-sonnet-5-5', fetch),
  ollama: (fetch: typeof globalThis.fetch) =>
    createOllamaProvider('llama3.2', { model: 'nomic-embed-text', dimensions: 768 }, fetch),
};
type Provider = keyof typeof factories;
const names = Object.keys(factories) as Provider[];
async function collect(stream: AsyncIterable<string>) {
  let text = '';
  for await (const part of stream) text += part;
  return text;
}
function json(value: unknown) {
  return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
}
function completion(name: Provider, text: string) {
  if (name === 'gemini')
    return json({
      candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 7, totalTokenCount: 18 },
    });
  if (name === 'anthropic')
    return json({
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      model: 'claude-sonnet-5-5',
      content: [{ type: 'text', text }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 11, output_tokens: 7 },
    });
  return json({
    id: 'test',
    object: 'chat.completion',
    created: 1,
    model: 'llama3.2',
    choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
  });
}
function stream(name: Provider) {
  let chunks: unknown[];
  if (name === 'gemini')
    chunks = [
      {
        candidates: [
          { content: { role: 'model', parts: [{ text: 'Hello' }] }, finishReason: 'STOP' },
        ],
        usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 7, totalTokenCount: 18 },
      },
    ];
  else if (name === 'anthropic')
    chunks = [
      {
        type: 'message_start',
        message: {
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          model: 'claude-sonnet-5-5',
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 11, output_tokens: 0 },
        },
      },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello' } },
      { type: 'content_block_stop', index: 0 },
      {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: 7 },
      },
      { type: 'message_stop' },
    ];
  else
    chunks = [
      {
        id: 'test',
        object: 'chat.completion.chunk',
        created: 1,
        model: 'llama3.2',
        choices: [
          { index: 0, delta: { role: 'assistant', content: 'Hello' }, finish_reason: 'stop' },
        ],
        usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
      },
    ];
  return new Response(chunks.map((value) => `data: ${JSON.stringify(value)}\n\n`).join(''), {
    headers: { 'content-type': 'text/event-stream' },
  });
}

test.each(names)('TC-185 / UT-49: %s structured output, options and usage', async (name) => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(() => Promise.resolve(completion(name, '{"ok":true}')));
  const signal = new AbortController().signal;
  const result = await factories[name](fetch).generateObject({
    ...request,
    schema,
    abortSignal: signal,
  });
  expect(result).toEqual({ object: { ok: true }, usage: { inputTokens: 11, outputTokens: 7 } });
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, init] = fetch.mock.calls[0] ?? [];
  expect(init?.signal).toBeDefined();
  const body = JSON.parse(z.string().parse(init?.body)) as Record<string, unknown>;
  if (name === 'gemini') {
    expect(url instanceof Request ? url.url : url?.toString()).toContain(
      '/models/gemini-2.5-flash:generateContent',
    );
    expect(body.generationConfig).toMatchObject({
      maxOutputTokens: 123,
      temperature: GENERATION.TEMPERATURE,
      responseMimeType: 'application/json',
    });
    expect(new Headers(init?.headers).get('x-goog-api-key')).toBe('test-google');
  } else {
    expect(body).toMatchObject({ max_tokens: 123 });
    if (name === 'anthropic')
      // Claude 5.5 models reject sampling parameters; lib/llm/models.ts omits temperature.
      expect(body).not.toHaveProperty('temperature');
    else expect(body).toMatchObject({ temperature: GENERATION.TEMPERATURE });
    if (name === 'ollama') {
      expect(url instanceof Request ? url.url : url?.toString()).toBe(
        'http://localhost:11434/v1/chat/completions',
      );
      expect(body.response_format).toEqual({ type: 'json_object' });
      expect(new Headers(init?.headers).has('authorization')).toBe(false);
    } else expect(new Headers(init?.headers).get('x-api-key')).toBe('test-anthropic');
  }
});
test.each(names)('TC-185 / UT-49: %s streams text and maps usage', async (name) => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(() => Promise.resolve(stream(name)));
  const result = factories[name](fetch).streamText(request);
  expect(await collect(result.textStream)).toBe('Hello');
  expect(await result.usage).toEqual({ inputTokens: 11, outputTokens: 7 });
  expect(fetch).toHaveBeenCalledTimes(1);
});
test.each(names.flatMap((name) => [429, 500].map((status) => ({ name, status }))))(
  'TC-185 / UT-49: $name HTTP $status is sanitized without retries',
  async ({ name, status }) => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(() =>
        Promise.resolve(new Response('private provider error', { status })),
      );
    const provider = factories[name](fetch);
    await expect(provider.generateObject({ ...request, schema })).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
      message: 'The language model did not respond.',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockClear();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = provider.streamText(request);
    await expect(collect(result.textStream)).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
      message: 'The language model did not respond.',
    });
    expect(await result.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
    expect(log).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);
test.each(names)(
  'TC-185 / UT-49: %s invalid JSON and invalid schema preserve rerank fallback classification',
  async (name) => {
    for (const output of ['not json', '{"ok":"wrong"}']) {
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockImplementation(() => Promise.resolve(completion(name, output)));
      const error: unknown = await factories[name](fetch)
        .generateObject({ ...request, schema })
        .catch((error: unknown) => error);
      expect(error).toMatchObject({ code: 'PROVIDER_ERROR' });
      expect(isInvalidOutput(error)).toBe(true);
    }
  },
);
test.each(names)(
  'TC-185 / UT-49: %s pre-abort and in-flight abort map to timeout',
  async (name) => {
    for (const before of [true, false]) {
      const controller = new AbortController();
      if (before) controller.abort();
      const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(() => {
        controller.abort();
        return Promise.reject(new DOMException('private abort', 'AbortError'));
      });
      const provider = factories[name](fetch);
      await expect(
        provider.generateObject({ ...request, schema, abortSignal: controller.signal }),
      ).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT' });
      expect(fetch).toHaveBeenCalledTimes(before ? 0 : 1);
      const result = provider.streamText({ ...request, abortSignal: controller.signal });
      await expect(collect(result.textStream)).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT' });
      expect(await result.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
    }
  },
);
test.each(['gemini', 'ollama'] as const)(
  'TC-185 / UT-49 / D-98: %s embeddings pass configured model and dimensions',
  async (name) => {
    const vectors = [Array<number>(768).fill(0), Array<number>(768).fill(1)];
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(() =>
      Promise.resolve(
        json(
          name === 'gemini'
            ? { embeddings: vectors.map((values) => ({ values })) }
            : {
                data: vectors.map((embedding, index) => ({ embedding, index })),
                usage: { prompt_tokens: 9 },
              },
        ),
      ),
    );
    const result = await factories[name](fetch).embed(['one', 'two']);
    expect(result.vectors).toEqual(vectors);
    expect(result.tokens).toBe(name === 'gemini' ? 0 : 9);
    const [url, init] = fetch.mock.calls[0] ?? [];
    const body = JSON.parse(z.string().parse(init?.body)) as Record<string, unknown>;
    if (name === 'gemini') {
      expect(url instanceof Request ? url.url : url?.toString()).toContain(
        'gemini-embedding-2:batchEmbedContents',
      );
      expect(body.requests).toEqual(
        ['one', 'two'].map((text) => ({
          model: 'models/gemini-embedding-2',
          content: { role: 'user', parts: [{ text }] },
          outputDimensionality: 768,
        })),
      );
    } else {
      expect(url instanceof Request ? url.url : url?.toString()).toBe(
        'http://localhost:11434/v1/embeddings',
      );
      expect(body).toMatchObject({
        model: 'nomic-embed-text',
        input: ['one', 'two'],
        dimensions: 768,
      });
    }
  },
);
test.each(['gemini', 'ollama'] as const)(
  'TC-185 / UT-49: %s embedding errors and aborts are mapped without retries',
  async (name) => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response('private', { status: 500 }));
    await expect(factories[name](fetch).embed(['text'])).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockClear();
    await expect(
      factories[name](fetch).embed(['text'], { abortSignal: AbortSignal.abort() }),
    ).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT' });
    expect(fetch).not.toHaveBeenCalled();
  },
);
test('TC-185 / UT-49: Anthropic is chat-only and config rejection lists working embedding providers', () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  expect(() => factories.anthropic(fetch).embed(['text'])).toThrow('openai, gemini, ollama, mock');
  const models = { chat: config.models.chat, rerank: config.models.rerank };
  expect(() => parseKitConfig({ ...config, models })).toThrow('openai, gemini, ollama, mock');
  expect(() =>
    parseKitConfig({
      ...config,
      models: { ...models, embed: { provider: 'anthropic', model: 'test', dimensions: 768 } },
    }),
  ).toThrow('openai, gemini, ollama, mock');
  expect(fetch).not.toHaveBeenCalled();
});
test('TC-185 / UT-49: registration resolves independent providers and optional role defaults', () => {
  const providers = getProviders();
  expect(providers.chat.name).toBe('anthropic');
  expect(providers.rerank.name).toBe('gemini');
  expect(providers.embed.name).toBe('ollama');
  expect(providers.generate).toBe(providers.chat);
  expect(providers.judge).toBe(providers.chat);
});
test('TC-185 / UT-49 / D-98: model dimensions and unknown-chat defaults', () => {
  expect(modelCapabilities('gemini', 'gemini-embedding-2').embedDimensions).toContain(128);
  expect(modelCapabilities('gemini', 'gemini-embedding-2').embedDimensions).toContain(3072);
  expect(modelCapabilities('gemini', 'gemini-embedding-2').embedDimensions).not.toContain(3073);
  expect(modelCapabilities('ollama', 'nomic-embed-text').embedDimensions).toEqual([768]);
  expect(modelCapabilities('ollama', 'custom-model')).toEqual({
    supportsTemperature: true,
    reasoning: false,
  });
});

test.each(names)('TC-185 / UT-49: %s omits temperature when the model rejects it', async (name) => {
  vi.spyOn(capabilities, 'modelCapabilities').mockReturnValue({
    supportsTemperature: false,
    reasoning: true,
  });
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(completion(name, '{"ok":true}'))
    .mockResolvedValueOnce(stream(name));
  const provider = factories[name](fetch);
  await provider.generateObject({ ...request, schema });
  await collect(provider.streamText(request).textStream);
  for (const [, init] of fetch.mock.calls) {
    const body = JSON.parse(z.string().parse(init?.body)) as Record<string, unknown>;
    expect(name === 'gemini' ? body.generationConfig : body).not.toHaveProperty('temperature');
  }
});
