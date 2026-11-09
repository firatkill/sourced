import { beforeEach, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { JSONParseError, TypeValidationError, NoObjectGeneratedError } from 'ai';
import { isInvalidOutput } from '@/lib/llm';
import { GENERATION } from '@/lib/config';
import { createOpenaiProvider, MODEL_SUPPORTS_TEMPERATURE, openaiProvider } from '@/lib/llm/openai';

const doubles = vi.hoisted(() => ({
  streamText: vi.fn(),
  generateText: vi.fn(),
  env: {
    OPENAI_API_KEY: 'test-only-not-a-key',
    CHAT_MODEL: 'test-chat',
    JUDGE_MODEL: 'test-judge',
  },
}));
vi.mock('ai', async (original) => ({
  ...(await original<typeof import('ai')>()),
  streamText: doubles.streamText,
  generateText: doubles.generateText,
}));
vi.mock('@/lib/env', () => ({ getEnv: () => doubles.env }));
const request = {
  model: 'chat' as const,
  system: 'System',
  prompt: 'Prompt',
  maxOutputTokens: 123,
};
async function* parts(items: unknown[]) {
  for (const item of items) yield await Promise.resolve(item);
}
async function collect(stream: AsyncIterable<string>) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}
beforeEach(() => {
  vi.clearAllMocks();
});

test('TC-057: fullStream text filtering, usage mapping and exact SDK controls', async () => {
  doubles.streamText.mockReturnValue({
    fullStream: parts([
      { type: 'start' },
      { type: 'text-delta', text: 'Hello' },
      { type: 'text-delta', text: ' world' },
      { type: 'finish' },
    ]),
    usage: Promise.resolve({ inputTokens: 11, outputTokens: 7 }),
  });
  const signal = new AbortController().signal;
  const result = openaiProvider.streamText({ ...request, abortSignal: signal });
  expect(await collect(result.textStream)).toEqual(['Hello', ' world']);
  expect(await result.usage).toEqual({ inputTokens: 11, outputTokens: 7 });
  expect(MODEL_SUPPORTS_TEMPERATURE).toBe(true);
  expect(doubles.streamText).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      model: expect.objectContaining({ modelId: 'test-chat' }) as unknown,
      instructions: 'System',
      prompt: 'Prompt',
      maxOutputTokens: 123,
      maxRetries: 0,
      temperature: GENERATION.TEMPERATURE,
      providerOptions: { openai: { reasoningEffort: 'none' } },
      abortSignal: signal,
    }),
  );
});

test.each([{}, { inputTokens: 3 }, { outputTokens: 4 }])(
  'TC-057: missing usage fields become zero (%j)',
  async (usage) => {
    doubles.streamText.mockReturnValue({ fullStream: parts([]), usage: Promise.resolve(usage) });
    const result = openaiProvider.streamText(request);
    await collect(result.textStream);
    expect(await result.usage).toEqual({
      inputTokens: 'inputTokens' in usage ? usage.inputTokens : 0,
      outputTokens: 'outputTokens' in usage ? usage.outputTokens : 0,
    });
  },
);

test.each([0, 1])('TC-057: error parts throw sanitized AppError after %i deltas', async (count) => {
  doubles.streamText.mockReturnValue({
    fullStream: parts([
      ...Array.from({ length: count }, () => ({ type: 'text-delta', text: 'Hi' })),
      { type: 'error', error: new Error('private provider detail') },
    ]),
    usage: Promise.reject(new Error('private usage failure')),
  });
  const result = openaiProvider.streamText(request);
  const chunks: string[] = [];
  await expect(
    (async () => {
      for await (const chunk of result.textStream) chunks.push(chunk);
    })(),
  ).rejects.toMatchObject({
    code: 'PROVIDER_ERROR',
    message: 'The language model did not respond.',
  });
  expect(chunks).toHaveLength(count);
  expect(await result.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
});
test('TC-057: SDK setup failures also throw from the iterator', async () => {
  doubles.streamText.mockImplementation(() => {
    throw new Error('private');
  });
  const result = openaiProvider.streamText(request);
  await expect(collect(result.textStream)).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
  expect(await result.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
});
test('TC-057: thrown transport errors map to AppError', async () => {
  doubles.streamText.mockReturnValue({
    fullStream: (async function* () {
      yield await Promise.resolve({ type: 'text-delta', text: 'Hi' });
      throw new Error('transport');
    })(),
    usage: Promise.resolve({}),
  });
  await expect(collect(openaiProvider.streamText(request).textStream)).rejects.toMatchObject({
    code: 'PROVIDER_ERROR',
  });
});
test('TC-057: abort parts map to timeout', async () => {
  doubles.streamText.mockReturnValue({
    fullStream: parts([{ type: 'abort' }]),
    usage: Promise.resolve({}),
  });
  await expect(collect(openaiProvider.streamText(request).textStream)).rejects.toMatchObject({
    code: 'PROVIDER_TIMEOUT',
    message: 'The language model took too long to respond.',
  });
});
test.each([true, false])(
  'TC-057: timeout signal before/during streaming (before=%s)',
  async (before) => {
    const controller = new AbortController();
    if (before) controller.abort(new DOMException('Timeout', 'TimeoutError'));
    doubles.streamText.mockReturnValue({
      fullStream: (async function* () {
        yield await Promise.resolve({ type: 'text-delta', text: 'Hi' });
        controller.abort(new DOMException('Timeout', 'TimeoutError'));
      })(),
      usage: Promise.resolve({}),
    });
    const result = openaiProvider.streamText({ ...request, abortSignal: controller.signal });
    await expect(collect(result.textStream)).rejects.toMatchObject({
      code: 'PROVIDER_TIMEOUT',
      message: 'The language model took too long to respond.',
    });
  },
);

test.each(['chat', 'judge'] as const)(
  'TC-057 / D-73: %s structured output disables strict schema, validates Zod and maps usage',
  async (model) => {
    const schema = z.object({ rationale: z.string().max(4) });
    doubles.generateText.mockResolvedValue({ output: { rationale: 'mock' }, usage: {} });
    const signal = new AbortController().signal;
    expect(
      await openaiProvider.generateObject({ ...request, model, schema, abortSignal: signal }),
    ).toEqual({ object: { rationale: 'mock' }, usage: { inputTokens: 0, outputTokens: 0 } });
    expect(doubles.generateText).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        model: expect.objectContaining({ modelId: `test-${model}` }) as unknown,
        instructions: 'System',
        prompt: 'Prompt',
        maxOutputTokens: 123,
        maxRetries: 0,
        abortSignal: signal,
        temperature: GENERATION.TEMPERATURE,
        providerOptions: { openai: { reasoningEffort: 'none', strictJsonSchema: false } },
        output: expect.objectContaining({ name: 'object' }) as unknown,
      }),
    );
  },
);
test('TC-057: Zod validation failure becomes provider error', async () => {
  doubles.generateText.mockResolvedValue({ output: { rationale: 'too long' }, usage: {} });
  await expect(
    openaiProvider.generateObject({
      ...request,
      schema: z.object({ rationale: z.string().max(4) }),
    }),
  ).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
});
test.each([new Error('private'), new DOMException('timeout', 'TimeoutError')])(
  'TC-057: structured SDK errors map safely ($name)',
  async (error) => {
    doubles.generateText.mockRejectedValue(error);
    await expect(
      openaiProvider.generateObject({ ...request, schema: z.object({}) }),
    ).rejects.toMatchObject({
      code: error.name === 'TimeoutError' ? 'PROVIDER_TIMEOUT' : 'PROVIDER_ERROR',
      message:
        error.name === 'TimeoutError'
          ? 'The language model took too long to respond.'
          : 'The language model did not respond.',
    });
  },
);
test('TC-057: structured usage preserves SDK counts', async () => {
  doubles.generateText.mockResolvedValue({
    output: {},
    usage: { inputTokens: 12, outputTokens: 6 },
  });
  expect((await openaiProvider.generateObject({ ...request, schema: z.object({}) })).usage).toEqual(
    { inputTokens: 12, outputTokens: 6 },
  );
});

test('TC-057: actual SDK stream errors stay catchable and never log raw provider details', async () => {
  const { streamText: actualStreamText } = await vi.importActual<typeof import('ai')>('ai');
  const { MockLanguageModelV4 } = await import('ai/test');
  const model = new MockLanguageModelV4({
    doStream: {
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: 'error', error: new Error('private provider detail') });
          controller.close();
        },
      }),
    },
  });
  doubles.streamText.mockImplementation((options: Parameters<typeof actualStreamText>[0]) =>
    actualStreamText({ ...options, model }),
  );
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const result = openaiProvider.streamText(request);
    await expect(collect(result.textStream)).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
    await expect(result.usage).resolves.toEqual({ inputTokens: 0, outputTokens: 0 });
    expect(log).not.toHaveBeenCalled();
    expect(model.doStreamCalls).toHaveLength(1);
  } finally {
    log.mockRestore();
  }
});

test('TC-057: actual SDK aborts a stalled transport and the iterator throws timeout', async () => {
  const { streamText: actualStreamText } = await vi.importActual<typeof import('ai')>('ai');
  const { MockLanguageModelV4 } = await import('ai/test');
  const controller = new AbortController();
  const model = new MockLanguageModelV4({
    doStream: () => {
      queueMicrotask(() => {
        controller.abort(new DOMException('Timeout', 'TimeoutError'));
      });
      return Promise.resolve({ stream: new ReadableStream() });
    },
  });
  doubles.streamText.mockImplementation((options: Parameters<typeof actualStreamText>[0]) =>
    actualStreamText({ ...options, model }),
  );
  const result = openaiProvider.streamText({ ...request, abortSignal: controller.signal });
  await expect(collect(result.textStream)).rejects.toMatchObject({
    code: 'PROVIDER_TIMEOUT',
    message: 'The language model took too long to respond.',
  });
  await expect(result.usage).resolves.toEqual({ inputTokens: 0, outputTokens: 0 });
});

test.each([true, false])(
  'TC-057: temperature follows model capability (%s)',
  async (supportsTemperature) => {
    const provider = createOpenaiProvider(supportsTemperature);
    doubles.streamText.mockReturnValue({ fullStream: parts([]), usage: Promise.resolve({}) });
    doubles.generateText.mockResolvedValue({ output: {}, usage: {} });
    await collect(provider.streamText(request).textStream);
    await provider.generateObject({ ...request, schema: z.object({}) });
    for (const sdk of [doubles.streamText, doubles.generateText]) {
      const options: unknown = sdk.mock.calls[0]?.[0];
      if (supportsTemperature) {
        expect(options).toHaveProperty('temperature', GENERATION.TEMPERATURE);
      } else {
        expect(options).not.toHaveProperty('temperature');
      }
    }
  },
);

test.each([
  new JSONParseError({ text: 'private invalid JSON', cause: new Error('parse') }),
  new TypeValidationError({ value: { private: true }, cause: new Error('schema') }),
])('TC-061 / TRD §13.0: SDK $name cause survives safe provider wrapping', async (cause) => {
  doubles.generateText.mockRejectedValue(cause);
  const error: unknown = await openaiProvider
    .generateObject({ ...request, schema: z.object({}) })
    .catch((error: unknown) => error);
  expect(error).toMatchObject({
    code: 'PROVIDER_ERROR',
    message: 'The language model did not respond.',
    cause,
  });
  expect(isInvalidOutput(error)).toBe(true);
});

test('TC-061 / TRD §13.0: post-parse Zod failures are distinguishable from transport failures', async () => {
  doubles.generateText.mockResolvedValue({ output: { ranking: 1 }, usage: {} });
  const error: unknown = await openaiProvider
    .generateObject({ ...request, schema: z.object({ ranking: z.array(z.string()) }) })
    .catch((error: unknown) => error);
  expect(error).toMatchObject({ code: 'PROVIDER_ERROR', cause: expect.any(z.ZodError) as unknown });
  expect(isInvalidOutput(error)).toBe(true);
  const cause = new Error('private transport details');
  doubles.generateText.mockRejectedValue(cause);
  const transport: unknown = await openaiProvider
    .generateObject({ ...request, schema: z.object({}) })
    .catch((error: unknown) => error);
  expect(transport).toMatchObject({ cause, message: 'The language model did not respond.' });
  expect(isInvalidOutput(transport)).toBe(false);
  expect(isInvalidOutput(null)).toBe(false);
});

test('TC-061 / TRD §13.0: actual SDK no-object failure is classified without network', async () => {
  const { generateText: actualGenerateText } = await vi.importActual<typeof import('ai')>('ai');
  const { MockLanguageModelV4 } = await import('ai/test');
  const model = new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: 'text', text: 'not JSON' }],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 1, text: 1, reasoning: 0 },
      },
      warnings: [],
    },
  });
  doubles.generateText.mockImplementation((options: Parameters<typeof actualGenerateText>[0]) =>
    actualGenerateText({ ...options, model }),
  );
  const error: unknown = await openaiProvider
    .generateObject({ ...request, schema: z.object({ ranking: z.array(z.string()) }) })
    .catch((error: unknown) => error);
  expect(error).toBeInstanceOf(Error);
  expect(error instanceof Error && NoObjectGeneratedError.isInstance(error.cause)).toBe(true);
  expect(isInvalidOutput(error)).toBe(true);
});
