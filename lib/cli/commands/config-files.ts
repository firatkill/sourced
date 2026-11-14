import { parseEnv } from 'node:util';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import type { KitConfig } from '@/lib/kit/config-schema';
import { parseKitConfig, writeConfigSnapshot } from '@/lib/kit/load-config';
import { AppError } from '@/lib/errors';
import { getCliEnvironment } from '@/lib/env';
import { localDatabaseUrl } from './database';

export const NO_SOURCES = 'No sources configured. Next: sourced add <url or path>';
export function requireSources(config: KitConfig) {
  if (!config.sources.length) throw new AppError('CORPUS_EMPTY', NO_SOURCES);
}
export async function readOptional(file: string): Promise<string> {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return '';
    throw error;
  }
}
export async function saveConfig(config: KitConfig, root = process.cwd()) {
  const validated = parseKitConfig(config);
  const target = path.join(root, 'sourced.config.ts');
  const temporary = `${target}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporary, `export default ${JSON.stringify(validated, null, 2)};\n`);
  await rename(temporary, target);
  await writeConfigSnapshot(validated, root);
  await updateIgnore(validated, root);
}
export async function updateIgnore(config: KitConfig, root: string) {
  const target = path.join(root, '.gitignore');
  const original = await readOptional(target);
  const lines = [
    '.sourced/',
    '.env.local',
    'corpus/*/raw/*',
    ...config.sources.flatMap((s) =>
      'commitRaw' in s && s.commitRaw
        ? [
            `!corpus/${config.corpus.name}/raw/${s.id}/`,
            `!corpus/${config.corpus.name}/raw/${s.id}/**`,
          ]
        : [],
    ),
  ];
  const missing = lines.filter((line) => !original.split(/\r?\n/).includes(line));
  if (missing.length)
    await writeFile(
      target,
      `${original}${original && !original.endsWith('\n') ? '\n' : ''}${missing.join('\n')}\n`,
    );
}
export function requiredVariables(config: KitConfig): string[] {
  const keys: Record<string, string> = {
    openai: 'OPENAI_API_KEY',
    gemini: 'GOOGLE_GENERATIVE_AI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
  };
  return [
    ...new Set([
      'DATABASE_URL',
      'QUESTION_HASH_SALT',
      'NEXT_PUBLIC_SITE_URL',
      ...Object.values(config.models).flatMap((model) =>
        model && keys[model.provider] ? [keys[model.provider] as string] : [],
      ),
      ...(config.profile === 'private' ? ['SOURCED_ACCESS_TOKEN'] : []),
      ...(config.profile === 'public-demo'
        ? [
            'IP_HASH_SALT',
            'RATE_LIMIT_IP_DAILY',
            'RATE_LIMIT_GLOBAL_DAILY',
            'DEMO_MODE',
            'CHAT_MODEL',
            'PRICE_CHAT_INPUT_PER_MTOK',
            'PRICE_CHAT_OUTPUT_PER_MTOK',
            'PRICE_EMBED_PER_MTOK',
          ]
        : []),
    ]),
  ];
}
/** Preserve the original bytes and all existing assignments, including empty ones. */
export async function initializeEnv(config: KitConfig, root: string) {
  const env = getCliEnvironment();
  const port = env.SOURCED_PORT ?? '3000';
  const database = env.SOURCED_DOCKER === '1' ? undefined : await localDatabaseUrl();
  const target = path.join(root, '.env.local');
  const original = await readOptional(target);
  const assignments = new Map(Object.entries(parseEnv(original)));
  const names = requiredVariables(config);
  const additions = names
    .filter((name) => !assignments.has(name))
    .map((name) => {
      const value =
        name === 'SOURCED_ACCESS_TOKEN'
          ? randomBytes(24).toString('base64url')
          : name === 'QUESTION_HASH_SALT' || name === 'IP_HASH_SALT'
            ? randomBytes(32).toString('hex')
            : name === 'NEXT_PUBLIC_SITE_URL'
              ? `http://localhost:${port}`
              : name === 'DATABASE_URL'
                ? (database ?? '')
                : name === 'CHAT_MODEL'
                  ? config.models.chat.model
                  : name === 'DEMO_MODE'
                    ? 'on'
                    : name === 'RATE_LIMIT_IP_DAILY' || name === 'RATE_LIMIT_GLOBAL_DAILY'
                      ? name === 'RATE_LIMIT_IP_DAILY'
                        ? '10'
                        : '300'
                      : name === 'PRICE_CHAT_INPUT_PER_MTOK'
                        ? String(
                            config.pricing[
                              `${config.models.chat.provider}:${config.models.chat.model}`
                            ]?.inputPerMTok ?? 0,
                          )
                        : name === 'PRICE_CHAT_OUTPUT_PER_MTOK'
                          ? String(
                              config.pricing[
                                `${config.models.chat.provider}:${config.models.chat.model}`
                              ]?.outputPerMTok ?? 0,
                            )
                          : name === 'PRICE_EMBED_PER_MTOK'
                            ? String(
                                config.pricing[
                                  `${config.models.embed.provider}:${config.models.embed.model}`
                                ]?.inputPerMTok ?? 0,
                              )
                            : '';
      assignments.set(name, value);
      return `${name}=${value}`;
    });
  if (additions.length)
    await writeFile(
      target,
      `${original}${original && !original.endsWith('\n') ? '\n' : ''}${additions.join('\n')}\n`,
      { mode: 0o600 },
    );
  return names.filter(
    (name) =>
      !(name === 'DATABASE_URL' && env.SOURCED_DOCKER === '1') &&
      (!assignments.get(name) || ['""', "''"].includes(assignments.get(name) ?? '')),
  );
}
