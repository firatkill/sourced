import { access } from 'node:fs/promises';
import path from 'node:path';
import { input as promptInput } from '@inquirer/prompts';
import { z } from 'zod';
import { AppError } from '@/lib/errors';
import { loadConfig, parseKitConfig } from '@/lib/kit/load-config';
import type { KitConfig } from '@/lib/kit/config-schema';
import { getConfigEnv } from '@/lib/env';
import { setCliKitConfig, getKitConfig } from '@/lib/kit/runtime-config';
import { confirmAction } from '../prompts';
import type { Invocation, CommandContext } from '../router';
import { initializeEnv, saveConfig } from './config-files';
import { detectSource } from './add';
import { initializeDatabase, repositoryRoot } from './database';

export async function runInit(
  input: Invocation,
  context: CommandContext,
  dependencies: {
    database?: (config: KitConfig) => Promise<'started' | 'running' | 'external'>;
    text?: (message: string) => Promise<string>;
    fetch?: typeof fetch;
  } = {},
) {
  const root = process.cwd();
  let exists = false;
  try {
    await access(path.join(root, 'sourced.config.ts'));
    exists = true;
  } catch {
    /* first run */
  }
  if (exists)
    await confirmAction({
      yes: input.values.yes === true,
      json: input.json,
      isTTY: context.isTTY,
      message: 'Replace sourced.config.ts?',
      ...(context.prompt ? { prompt: context.prompt } : {}),
    });
  const example =
    input.values.example === true
      ? await loadConfig(repositoryRoot, { writeSnapshot: false })
      : undefined;
  const values = { ...input.values };
  if (!example)
    for (const field of ['corpus-name', 'title', 'description', 'language', 'chat', 'embed']) {
      if (typeof values[field] === 'string') continue;
      if (input.json || !context.isTTY)
        throw new AppError(
          'NEEDS_CONFIRMATION',
          `Provide --${field} to initialize without prompts.`,
        );
      values[field] = await (dependencies.text ?? ((message) => promptInput({ message })))(field);
    }
  const role = (value: string) => {
    const separator = value.indexOf(':');
    if (separator < 1) throw new AppError('CONFIG_INVALID', 'Use provider:model for a model.');
    return { provider: value.slice(0, separator), model: value.slice(separator + 1) };
  };
  const embedValue = typeof values.embed === 'string' ? values.embed : undefined;
  const embed = embedValue
    ? {
        ...role(embedValue.slice(0, embedValue.lastIndexOf(':'))),
        dimensions: Number(embedValue.slice(embedValue.lastIndexOf(':') + 1)),
      }
    : example?.models.embed;
  const config = parseKitConfig({
    ...(example ?? {}),
    schemaVersion: 1,
    corpus: {
      ...example?.corpus,
      name: values['corpus-name'] ?? example?.corpus.name,
      title: values.title ?? example?.corpus.title,
      description: values.description ?? example?.corpus.description,
      language: values.language ?? example?.corpus.language,
    },
    sources: example?.sources ?? [],
    profile: values.profile ?? 'local',
    models: {
      ...example?.models,
      chat: typeof values.chat === 'string' ? role(values.chat) : example?.models.chat,
      embed,
    },
  });
  if (typeof values.source === 'string')
    config.sources.push((await detectSource(values.source, {}, dependencies.fetch)).source);
  // Validate all choices before touching files or starting the database.
  z.object({ profile: z.enum(['local', 'private', 'public-demo']) }).parse(config);
  await saveConfig(config, root);
  const envVarsToFill = await initializeEnv(config, root);
  if (config.profile === 'private')
    context.progress(
      'SOURCED_ACCESS_TOKEN is stored in .env.local; existing assignments are preserved.',
    );
  setCliKitConfig(config);
  const database = await (dependencies.database ?? initializeDatabase)(
    getConfigEnv().LLM_MODE === 'mock' ? getKitConfig() : config,
  );
  return { configPath: path.join(root, 'sourced.config.ts'), envVarsToFill, database };
}
