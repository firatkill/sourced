import 'server-only';
// T-89 / R2 §6 (security 3): keys are written atomically to `.env.local` (mode 0600),
// set in the running server's `process.env`, and never sent back to the browser.
import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { reloadEnv } from '@/lib/env';
import { reloadKitConfig } from '@/lib/kit/runtime-config';

/** Only these names may be written from the browser (R2 §6 security 5). */
export const EDITABLE_ENV = [
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'OLLAMA_BASE_URL',
] as const;
export type EditableEnv = (typeof EDITABLE_ENV)[number];

const SAFE_VALUE = /^[\x21-\x7e]{1,512}$/;
export function validEnvValue(value: string): boolean {
  return SAFE_VALUE.test(value) && !/["'`\\$#]/.test(value);
}

/** Replaces or appends each name; `null` removes it. Other lines stay byte for byte. */
export async function writeEnvValues(
  values: Partial<Record<EditableEnv, string | null>>,
  root = process.cwd(),
): Promise<void> {
  for (const [name, value] of Object.entries(values))
    if (
      !(EDITABLE_ENV as readonly string[]).includes(name) ||
      (value !== null && !validEnvValue(value))
    )
      throw new Error(`Refusing to write ${name}.`);
  const file = path.join(root, '.env.local');
  let original = '';
  try {
    original = await readFile(file, 'utf8');
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }
  const pending = new Map(Object.entries(values));
  const lines = original === '' ? [] : original.replace(/\r?\n$/, '').split(/\r?\n/);
  const kept = lines.flatMap((line) => {
    const name = /^([A-Z][A-Z0-9_]*)=/.exec(line)?.[1];
    if (!name || !pending.has(name)) return [line];
    const value = pending.get(name);
    pending.delete(name);
    return value === null || value === undefined ? [] : [`${name}=${value}`];
  });
  for (const [name, value] of pending) if (value) kept.push(`${name}=${value}`);
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporary, kept.length ? `${kept.join('\n')}\n` : '', { mode: 0o600 });
  await rename(temporary, file);
  for (const [name, value] of Object.entries(values)) {
    if (value === null) Reflect.deleteProperty(process.env, name);
    else process.env[name] = value;
  }
  reloadEnv();
  reloadKitConfig();
}

/** `sk-…a91F`: enough to recognise a key, never enough to use it. */
export function maskKey(value: string | undefined): string | null {
  if (!value) return null;
  if (value.length < 12) return '••••';
  const prefix = /^(sk-ant-|sk-proj-|sk-|AIza)/.exec(value)?.[1] ?? '';
  return `${prefix}…${value.slice(-4)}`;
}
