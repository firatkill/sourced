import 'server-only';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { EMBEDDING } from '@/lib/config';
import { getConfigEnv } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { configHash, SnapshotSchema } from './load-config';
import type { KitConfig } from './config-schema';

let cached: KitConfig | undefined;
export function readSnapshot(filename: string): KitConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(filename, 'utf8'));
  } catch (cause) {
    throw new AppError('CONFIG_INVALID', 'Run ./sourced init first.', { cause });
  }
  const result = SnapshotSchema.safeParse(raw);
  if (!result.success)
    throw new AppError(
      'CONFIG_INVALID',
      result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n'),
    );
  if (configHash(result.data.config) !== result.data.configHash)
    throw new AppError(
      'CONFIG_INVALID',
      'configHash: Run ./sourced config:snapshot to regenerate the snapshot.',
    );
  return result.data.config;
}
export function getKitConfig(applyMock = true): KitConfig {
  cached ??= readSnapshot(path.join(process.cwd(), '.sourced/config.json'));
  const env = getConfigEnv();
  const config = structuredClone(cached);
  if (config.profile === 'public-demo') {
    if (env.CHAT_MODEL) config.models.chat.model = env.CHAT_MODEL;
    if (env.JUDGE_MODEL)
      config.models.judge = {
        provider: config.models.judge?.provider ?? config.models.chat.provider,
        model: env.JUDGE_MODEL,
      };
    const price = (
      role: 'chat' | 'judge' | 'embed',
      input: number | undefined,
      output: number | undefined,
    ) => {
      if (input === undefined && output === undefined) return;
      const model = config.models[role] ?? config.models.chat;
      config.pricing[`${model.provider}:${model.model}`] = {
        inputPerMTok:
          input ?? config.pricing[`${model.provider}:${model.model}`]?.inputPerMTok ?? 0,
        outputPerMTok:
          output ?? config.pricing[`${model.provider}:${model.model}`]?.outputPerMTok ?? 0,
      };
    };
    price('chat', env.PRICE_CHAT_INPUT_PER_MTOK, env.PRICE_CHAT_OUTPUT_PER_MTOK);
    price('judge', env.PRICE_JUDGE_INPUT_PER_MTOK, env.PRICE_JUDGE_OUTPUT_PER_MTOK);
    price('embed', env.PRICE_EMBED_PER_MTOK, undefined);
  }
  // The v1 mock harness remains a runtime override, not a production config.
  if (applyMock && env.LLM_MODE === 'mock') {
    for (const role of ['chat', 'rerank', 'judge', 'generate'] as const)
      if (role === 'chat' || config.models[role])
        config.models[role] = { provider: 'mock', model: 'mock' };
    config.models.embed = {
      provider: 'mock',
      model: EMBEDDING.MOCK_MODEL,
      dimensions: config.models.embed.dimensions,
    };
  }
  return config;
}
export function resetKitConfigForTests(): void {
  cached = undefined;
}

/** CLI can use validated configuration without writing a snapshot during a dry run. */
export function setCliKitConfig(config: KitConfig): void {
  cached = structuredClone(config);
}
