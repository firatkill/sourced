import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { AppError } from '@/lib/errors';
import { getCliEnvironment } from '@/lib/env';
import { ensureComposeProject } from '@/lib/kit/compose-project';
import { loadConfig } from '@/lib/kit/load-config';
import type { KitConfig } from '@/lib/kit/config-schema';
import { DOCLING_IMAGE, doclingStatus, type DoclingState } from '@/lib/ingest/docling';
import type { CommandContext } from '../router';
import { saveConfig } from './config-files';
import { execute } from './database';

export type DoclingResult = {
  engine: 'builtin' | 'docling';
  service: DoclingState;
  image: string;
  /** The reader changed: the next `ingest` reads PDF, Word and PowerPoint files again. */
  changed: boolean;
};

const engineOf = (config: KitConfig) => config.parsing?.engine ?? 'builtin';

/** Docker Compose output (pull progress) goes to stderr so `--json` stdout stays one envelope. */
function compose(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['compose', ...args], {
      cwd: process.cwd(),
      stdio: ['ignore', process.stderr, process.stderr],
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`docker compose ${args.join(' ')} exited with ${String(code)}`));
    });
  });
}

async function waitReady(context: CommandContext, seconds: number): Promise<DoclingState> {
  let state = await doclingStatus();
  for (let waited = 0; state !== 'ready' && waited < seconds; waited += 3) {
    if (waited % 30 === 0) context.progress('Waiting for Docling to load its models…');
    await sleep(3000);
    state = await doclingStatus();
  }
  return state;
}

/**
 * D-152 / TRD §45.2. The Docker launchers start and stop the container before this runs
 * (the CLI container has no Docker socket); on the Node path this command does it.
 */
export async function runDocling(
  mode: 'on' | 'off' | 'status',
  context: CommandContext,
): Promise<DoclingResult> {
  const docker = getCliEnvironment().SOURCED_DOCKER === '1';
  const config = await loadConfig(process.cwd(), { writeSnapshot: false });
  const before = engineOf(config);
  if (mode === 'status')
    return { engine: before, service: await doclingStatus(), image: DOCLING_IMAGE, changed: false };

  if (mode === 'on') {
    if (!docker) {
      context.progress(
        'Downloading Docling the first time (about 2.1 GB, 6.5 GB on disk), then starting it…',
      );
      try {
        await ensureComposeProject(process.cwd(), (file, args) => execute(file, args));
        await compose(['--profile', 'docling', 'up', '-d', 'docling']);
      } catch (cause) {
        throw new AppError(
          'INTERNAL_ERROR',
          'Could not start Docling. Check that Docker is running and has room for a 6.5 GB image, then retry.',
          { cause },
        );
      }
    }
    if (before !== 'docling')
      await saveConfig({ ...config, parsing: { engine: 'docling' } }, process.cwd());
    const service = await waitReady(context, 300);
    return { engine: 'docling', service, image: DOCLING_IMAGE, changed: before !== 'docling' };
  }

  if (before !== 'builtin') {
    const rest = { ...config };
    delete rest.parsing;
    await saveConfig(rest, process.cwd());
  }
  if (!docker) await compose(['--profile', 'docling', 'stop', 'docling']).catch(() => undefined);
  return {
    engine: 'builtin',
    service: await doclingStatus(),
    image: DOCLING_IMAGE,
    changed: before !== 'builtin',
  };
}
