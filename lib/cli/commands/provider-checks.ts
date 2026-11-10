import { z } from 'zod';
import type { KitConfig } from '@/lib/kit/config-schema';
import { getCliEnvironment } from '@/lib/env';
import { createMockProvider } from '@/lib/llm/mock';

export type DiagnosticEnvironment = ReturnType<typeof getCliEnvironment>;
export async function checkProviderKeys(
  config: KitConfig,
  env: DiagnosticEnvironment,
  noNetwork: boolean,
  fetcher: typeof fetch = fetch,
) {
  if (env.LLM_MODE === 'mock') return 'Mock mode; no provider network requests.';
  const endpoints = {
    openai: ['https://api.openai.com/v1/models', 'OPENAI_API_KEY'],
    gemini: [
      'https://generativelanguage.googleapis.com/v1beta/models',
      'GOOGLE_GENERATIVE_AI_API_KEY',
    ],
    anthropic: ['https://api.anthropic.com/v1/models', 'ANTHROPIC_API_KEY'],
  } as const;
  for (const provider of new Set(
    Object.values(config.models).flatMap((m) => (m ? [m.provider] : [])),
  )) {
    if (provider === 'mock') continue;
    const headers: Record<string, string> = {};
    let url = `${env.OLLAMA_BASE_URL ?? 'http://localhost:11434'}/api/tags`;
    if (provider !== 'ollama') {
      const [endpoint, name] = endpoints[provider];
      const key = env[name];
      if (!key?.trim()) throw new Error(`Set ${name} in .env.local.`);
      url = endpoint;
      if (provider === 'openai') headers.Authorization = `Bearer ${key}`;
      if (provider === 'gemini') headers['x-goog-api-key'] = key;
      if (provider === 'anthropic') {
        headers['x-api-key'] = key;
        headers['anthropic-version'] = '2023-06-01';
      }
    }
    if (noNetwork) continue;
    const response = await fetcher(url, { headers, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error('Provider authentication failed.');
    if (provider === 'ollama') {
      const body = z
        .object({ models: z.array(z.object({ name: z.string() })) })
        .parse(await response.json());
      for (const model of Object.values(config.models).filter((m) => m?.provider === 'ollama'))
        if (
          model &&
          !body.models.some((m) => m.name === model.model || m.name === `${model.model}:latest`)
        )
          throw new Error('Pull the configured Ollama models.');
    } else await response.body?.cancel();
  }
  return noNetwork
    ? 'Key presence checked; authentication skipped (--no-network).'
    : 'Configured providers authenticated; configured Ollama models available.';
}
export async function checkDimensions(
  config: KitConfig,
  env: DiagnosticEnvironment,
  fetcher: typeof fetch = fetch,
) {
  const model = config.models.embed;
  let vector: number[];
  if (env.LLM_MODE === 'mock' || model.provider === 'mock') {
    vector = (await createMockProvider(model.dimensions).embed(['test'])).vectors[0] ?? [];
  } else {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    let url: string;
    let body: unknown;
    if (model.provider === 'openai') {
      url = 'https://api.openai.com/v1/embeddings';
      headers.Authorization = `Bearer ${env.OPENAI_API_KEY ?? ''}`;
      body = { model: model.model, input: ['test'], dimensions: model.dimensions };
    } else if (model.provider === 'gemini') {
      url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.model)}:embedContent`;
      headers['x-goog-api-key'] = env.GOOGLE_GENERATIVE_AI_API_KEY ?? '';
      body = {
        model: `models/${model.model}`,
        content: { parts: [{ text: 'test' }] },
        outputDimensionality: model.dimensions,
      };
    } else {
      url = `${env.OLLAMA_BASE_URL ?? 'http://localhost:11434'}/api/embed`;
      body = { model: model.model, input: ['test'] };
    }
    const response = await fetcher(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error('Embedding request failed.');
    const data: unknown = await response.json();
    const numbers = z.array(z.number());
    vector =
      model.provider === 'openai'
        ? (z.object({ data: z.array(z.object({ embedding: numbers })).min(1) }).parse(data).data[0]
            ?.embedding ?? [])
        : model.provider === 'gemini'
          ? z.object({ embedding: z.object({ values: numbers }) }).parse(data).embedding.values
          : (z.object({ embeddings: z.array(numbers).min(1) }).parse(data).embeddings[0] ?? []);
  }
  if (vector.length !== model.dimensions) throw new Error('Embedding dimensions differ.');
  return `Embedding length matches configured dimensions (${String(model.dimensions)}).`;
}
