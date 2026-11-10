// TC-192 / E2E-26: both compiled copy and runtime config belong to this fixture.
import { spawn, type ChildProcess } from 'node:child_process';
import { cp, mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { configHash, parseKitConfig } from '../../../lib/kit/load-config';
import { getCopy } from '../../../lib/kit/copy';
import { fixtureDatabaseUrl } from './database';
import fixtureConfig from './sourced.config';

const root = process.cwd();
const directory = await mkdtemp(path.join(tmpdir(), 'sourced-kit-tr-e2e-'));
let child: ChildProcess | undefined;
let stopped = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    stopped = true;
    child?.kill(signal);
  });
}
const env = {
  ...process.env,
  DATABASE_URL: fixtureDatabaseUrl(process.env.DATABASE_URL),
  LLM_MODE: 'mock',
  NEXT_PUBLIC_SITE_URL: 'http://localhost:3104',
};
async function next(command: 'build' | 'start') {
  if (stopped) throw new Error('Fixture server stopped');
  const args = [path.join(root, 'node_modules/next/dist/bin/next'), command, directory];
  if (command === 'start') args.push('-p', '3104');
  await new Promise<void>((resolve, reject) => {
    child = spawn(process.execPath, args, { cwd: directory, env, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      child = undefined;
      if (code === 0 || stopped) resolve();
      else reject(new Error(`Fixture ${command} failed: ${String(code ?? signal)}`));
    });
  });
}
try {
  // Copy only source/build inputs; never copy .env.local, .git or the example's .next.
  for (const name of [
    'app',
    'components',
    'hooks',
    'lib',
    'public',
    'eval/thresholds.json',
    'tests/fixtures/eval-results',
    'middleware.ts',
    'instrumentation.ts',
    'next.config.ts',
    'next-env.d.ts',
    'global.d.ts',
    'postcss.config.mjs',
    'tsconfig.json',
    'package.json',
    'pnpm-lock.yaml',
    'eslint.config.mjs',
  ])
    await cp(path.join(root, name), path.join(directory, name), { recursive: true });
  await symlink(path.join(root, 'node_modules'), path.join(directory, 'node_modules'), 'dir');
  const config = parseKitConfig(fixtureConfig);
  await mkdir(path.join(directory, '.sourced'));
  await writeFile(
    path.join(directory, '.sourced/config.json'),
    JSON.stringify({
      schemaVersion: 1,
      configHash: configHash(config),
      writtenAt: new Date().toISOString(),
      config,
    }),
  );
  await writeFile(path.join(directory, '.sourced/copy.json'), JSON.stringify(getCopy(config)));
  await next('build');
  await next('start');
} finally {
  await rm(directory, { recursive: true, force: true });
}
