import 'server-only';
import { createHash } from 'node:crypto';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { KitConfigSchema, type KitConfig } from './config-schema';
import { AppError } from '@/lib/errors';
import { ftsConfig } from './fts';
import { getCopy } from './copy';

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
      .join(',')}}`;
  }
  return value === undefined ? 'null' : JSON.stringify(value);
}
export function configHash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}
export function parseKitConfig(value: unknown): KitConfig {
  const result = KitConfigSchema.safeParse(value);
  if (!result.success)
    throw new AppError(
      'CONFIG_INVALID',
      result.error.issues
        .map(
          (i) =>
            `${i.path.join('.')}: ${i.message}${i.path[0] === 'models' && i.path[1] === 'embed' ? ' Choose an embedding provider: openai, gemini, ollama, mock.' : ''}`,
        )
        .join('\n'),
    );
  return result.data;
}
export const SnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  configHash: z.string().regex(/^[a-f0-9]{64}$/),
  writtenAt: z.iso.datetime(),
  config: KitConfigSchema,
});

/** Executed through tsx by CLI scripts, never imported as a TS config by Next. */
export async function loadConfig(
  root = process.cwd(),
  options: { writeSnapshot?: boolean } = {},
): Promise<KitConfig> {
  let loaded: unknown;
  try {
    loaded = await import(
      /* webpackIgnore: true */ pathToFileURL(path.join(root, 'sourced.config.ts')).href +
        `?load=${crypto.randomUUID()}`
    );
  } catch (cause) {
    throw new AppError(
      'CONFIG_INVALID',
      'sourced.config.ts: Create a valid TypeScript configuration with a default export.',
      { cause },
    );
  }
  const config = parseKitConfig(z.object({ default: z.unknown() }).parse(loaded).default);
  if (options.writeSnapshot === false) return config;
  await writeConfigSnapshot(config, root);
  return config;
}

/** Persist an already validated config, including local-profile dev overrides. */
export async function writeConfigSnapshot(config: KitConfig, root = process.cwd()): Promise<void> {
  const directory = path.join(root, '.sourced');
  await mkdir(directory, { recursive: true });
  const snapshot = {
    schemaVersion: 1,
    configHash: configHash(config),
    writtenAt: new Date().toISOString(),
    config,
  };
  const temporary = path.join(directory, `config.${crypto.randomUUID()}.tmp`);
  await writeFile(temporary, JSON.stringify(snapshot, null, 2) + '\n');
  await rename(temporary, path.join(directory, 'config.json'));
  const copyTemporary = path.join(directory, `copy.${crypto.randomUUID()}.tmp`);
  await writeFile(copyTemporary, JSON.stringify(getCopy(snapshot.config), null, 2) + '\n');
  await rename(copyTemporary, path.join(directory, 'copy.json'));
  const mounts = config.sources
    .flatMap((source) =>
      source.type === 'folder' || source.type === 'git' ? [path.resolve(root, source.path)] : [],
    )
    .filter((p) => {
      const relative = path.relative(root, p);
      return relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
    });
  await writeFile(path.join(directory, 'mounts'), mounts.join('\n'));
  if (ftsConfig(config.corpus.language) === 'simple')
    process.stderr.write(`corpus.language: ${config.corpus.language} uses simple text search.\n`);
}
