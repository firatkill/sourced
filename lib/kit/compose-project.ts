import { randomBytes } from 'node:crypto';
import { appendFile, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

type Execute = (file: string, args: string[]) => Promise<{ stdout: string }>;

/**
 * D-136: one Compose project per checkout, recorded as COMPOSE_PROJECT_NAME in `.env`
 * (which Compose reads itself). Mirrors the launchers: an upgrade keeps the project its
 * containers already use; a new checkout gets `sourced-<8 hex>`. Returns the name, or
 * undefined when Docker cannot be asked (nothing is written then).
 */
export async function ensureComposeProject(
  root: string,
  execute: Execute,
  environment: Record<string, string | undefined> = process.env,
): Promise<string | undefined> {
  if (environment.COMPOSE_PROJECT_NAME) return environment.COMPOSE_PROJECT_NAME;
  const file = path.join(root, '.env');
  const existing = await readFile(file, 'utf8').catch(() => '');
  const recorded = existing
    .split(/\r?\n/)
    .filter((line) => line.startsWith('COMPOSE_PROJECT_NAME='))
    .at(-1)
    ?.slice('COMPOSE_PROJECT_NAME='.length)
    .trim();
  if (recorded) return recorded;
  let listing: string;
  try {
    listing = (
      await execute('docker', [
        'ps',
        '-a',
        '--format',
        '{{.Label "com.docker.compose.project.working_dir"}}|{{.Label "com.docker.compose.project"}}',
      ])
    ).stdout;
  } catch {
    return undefined;
  }
  const here = (await realpath(root)).replace(/[\\/]+$/, '').toLowerCase();
  const legacy = listing
    .split(/\r?\n/)
    .map((line) => line.split('|'))
    .find(([dir, name]) => name && dir && dir.replace(/[\\/]+$/, '').toLowerCase() === here)?.[1];
  const project = legacy ?? `sourced-${randomBytes(4).toString('hex')}`;
  const prefix = existing && !existing.endsWith('\n') ? '\n' : '';
  await appendFile(file, `${prefix}COMPOSE_PROJECT_NAME=${project}\n`);
  return project;
}
