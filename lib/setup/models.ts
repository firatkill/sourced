import 'server-only';
// T-91 / R2 Settings: model choices for answers, quality checks and search. Answer and
// check models change in place; an embedding change needs a rebuild, so it is estimated
// first and saved only when the person confirms.
import { z } from 'zod';
import { AppError } from '@/lib/errors';
import type { KitConfig } from '@/lib/kit/config-schema';
import { parseKitConfig } from '@/lib/kit/load-config';
import { MODELS } from '@/lib/llm/models';
import { KEYED_PROVIDERS, type KeyedProvider } from './keys';

/** Dimensions a new embedding model starts with (≤ 2000 keeps the plain `vector` index). */
const DEFAULT_DIMENSIONS: Record<string, number> = {
  'openai:text-embedding-3-small': 1536,
  'openai:text-embedding-3-large': 1536,
  'gemini:gemini-embedding-2': 1536,
  'gemini:gemini-embedding-001': 1536,
  'ollama:nomic-embed-text': 768,
};
const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
  ollama: 'Ollama',
};

export const ModelId = z.string().regex(/^(openai|anthropic|gemini|ollama):[\w.:-]{1,80}$/);

function available(provider: string): boolean {
  if (provider === 'ollama') return true;
  const env = KEYED_PROVIDERS[provider as KeyedProvider].env;
  return Boolean(process.env[env]?.trim());
}

export function modelOptions(config: KitConfig) {
  const option = (id: string) => {
    const [provider = '', ...rest] = id.split(':');
    const price = config.pricing[id];
    return {
      id,
      provider,
      providerLabel: PROVIDER_LABELS[provider] ?? provider,
      model: rest.join(':'),
      available: available(provider),
      price: price ? { input: price.inputPerMTok, output: price.outputPerMTok } : null,
    };
  };
  const ids = Object.keys(MODELS);
  const chat = ids.filter((id) => !MODELS[id]?.embedDimensions).map(option);
  const embed = ids.filter((id) => MODELS[id]?.embedDimensions).map(option);
  const current = (role: 'chat' | 'judge') => {
    const model = config.models[role] ?? config.models.chat;
    return `${model.provider}:${model.model}`;
  };
  // A configured model outside the catalog still shows as the current choice.
  for (const [list, id] of [
    [chat, current('chat')],
    [chat, current('judge')],
    [embed, `${config.models.embed.provider}:${config.models.embed.model}`],
  ] as const)
    if (!list.some((item) => item.id === id)) list.unshift(option(id));
  return {
    current: {
      chat: current('chat'),
      judge: current('judge'),
      embed: `${config.models.embed.provider}:${config.models.embed.model}`,
      dimensions: config.models.embed.dimensions,
    },
    chat,
    embed,
  };
}

function role(id: string) {
  const [provider = '', ...rest] = ModelId.parse(id).split(':');
  return { provider: provider as 'openai', model: rest.join(':') };
}

export function withModels(config: KitConfig, change: { chat?: string; judge?: string }) {
  const next = structuredClone(config);
  if (change.chat) next.models.chat = role(change.chat);
  if (change.judge) next.models.judge = role(change.judge);
  return parseKitConfig(next);
}

export function withEmbedding(config: KitConfig, id: string): KitConfig {
  const { provider, model } = role(id);
  if (!MODELS[id]?.embedDimensions)
    throw new AppError('VALIDATION_FAILED', 'Choose an embedding model from the list.');
  if (`${config.models.embed.provider}:${config.models.embed.model}` === id)
    throw new AppError('VALIDATION_FAILED', 'This embedding model is already in use.');
  const next = structuredClone(config);
  next.models.embed = {
    provider,
    model,
    dimensions: DEFAULT_DIMENSIONS[id] ?? config.models.embed.dimensions,
  };
  return parseKitConfig(next);
}

/**
 * Setup's Advanced settings: every model is chosen before the first index, so a new
 * embedding model is saved at once. Step 4's estimate then reports a rebuild if the
 * index already holds passages from another model.
 */
export function withSetupModels(
  config: KitConfig,
  change: { chat?: string; judge?: string; embed?: string },
): KitConfig {
  const next = withModels(config, {
    ...(change.chat ? { chat: change.chat } : {}),
    ...(change.judge ? { judge: change.judge } : {}),
  });
  const current = `${next.models.embed.provider}:${next.models.embed.model}`;
  return change.embed && change.embed !== current ? withEmbedding(next, change.embed) : next;
}
