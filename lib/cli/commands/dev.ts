import { getEnv } from '@/lib/env';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { z } from 'zod';
import { loadConfig, writeConfigSnapshot } from '@/lib/kit/load-config';
import { AppError } from '@/lib/errors';
import type { Invocation, CommandContext } from '../router';
import { repositoryRoot } from './database';

export async function runDev(input: Invocation, context: CommandContext) {
  const config = await loadConfig(process.cwd(), { writeSnapshot: false });
  await writeConfigSnapshot({ ...config, profile: 'local' });
  getEnv();
  const port = z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .parse(input.values.port ?? 3000);
  const child = spawn(
    process.execPath,
    [path.join(repositoryRoot, 'node_modules/next/dist/bin/next'), 'dev', '--port', String(port)],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let interrupted = false;
  const interrupt = () => {
    interrupted = true;
    process.exitCode = 130;
    child.kill('SIGTERM');
  };
  const stop = () => {
    child.kill('SIGTERM');
  };
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', stop);
  return new Promise<{ url: string }>((resolve, reject) => {
    let ready = false;
    const buffers = { out: '', err: '' };
    const output = (stream: 'out' | 'err', chunk: Buffer) => {
      buffers[stream] += chunk.toString();
      const lines = buffers[stream].split('\n');
      buffers[stream] = lines.pop() ?? '';
      for (const line of lines) {
        context.progress(line);
        if (/Ready in/.test(line) && !ready) {
          ready = true;
          resolve({ url: `http://localhost:${String(port)}` });
        }
      }
    };
    child.stdout.on('data', (chunk: Buffer) => {
      output('out', chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      output('err', chunk);
    });
    child.once('error', () => {
      process.off('SIGINT', interrupt);
      process.off('SIGTERM', stop);
      reject(new AppError('INTERNAL_ERROR', 'Could not start next dev.'));
    });
    child.once('exit', (code) => {
      process.off('SIGINT', interrupt);
      process.off('SIGTERM', stop);
      if (!ready)
        reject(
          interrupted
            ? Object.assign(new Error('Interrupted'), { name: 'AbortPromptError' })
            : new AppError('INTERNAL_ERROR', 'next dev exited before it was ready.'),
        );
      else if (code && !interrupted) process.exitCode = code;
    });
  });
}
