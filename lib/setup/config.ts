import 'server-only';
// T-89: inside the app server the snapshot is the configuration (Next cannot import
// `sourced.config.ts`). Writes go through `saveConfig`, exactly as `add` and `reset` do,
// then the running server drops its cached copy.
import path from 'node:path';
import { saveConfig } from '@/lib/cli/commands/config-files';
import type { KitConfig } from '@/lib/kit/config-schema';
import { readSnapshot, reloadKitConfig } from '@/lib/kit/runtime-config';

export function readConfig(root = process.cwd()): KitConfig {
  return readSnapshot(path.join(root, '.sourced/config.json'));
}

export async function writeConfig(config: KitConfig, root = process.cwd()): Promise<void> {
  await saveConfig(config, root);
  reloadKitConfig();
}

/** The bundled example carries its own notice (T-80); own documents never do. */
export function isExample(config: KitConfig): boolean {
  return Boolean(config.copy.exampleNotice);
}
