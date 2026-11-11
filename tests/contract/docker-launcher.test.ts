// TC-214 / FR-94; TRD §35.3: exercise the POSIX launcher without a Docker daemon.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';

const execute = promisify(execFile);
const directories: string[] = [];
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'sourced-docker-'));
  directories.push(root);
  await copyFile('sourced', path.join(root, 'sourced'));
  await mkdir(path.join(root, 'bin'));
  for (const command of ['dirname', 'uname', 'id', 'touch'])
    await symlink(`/usr/bin/${command}`, path.join(root, 'bin', command));
  const log = path.join(root, 'arguments');
  await writeFile(
    path.join(root, 'bin/docker'),
    '#!/bin/sh\nprintf "%s\\n" CALL "$@" >> "$DOCKER_ARGUMENT_LOG"\n',
    { mode: 0o755 },
  );
  const run = (args: string[]) =>
    execute('/bin/sh', [path.join(root, 'sourced'), ...args], {
      env: {
        NODE_ENV: 'test',
        PATH: path.join(root, 'bin'),
        DOCKER_ARGUMENT_LOG: log,
      },
      cwd: tmpdir(),
    });
  return { root, log, run };
}
afterEach(async () => {
  for (const dir of directories.splice(0)) await rm(dir, { recursive: true, force: true });
});
test('TC-214: missing environment stops ordinary commands with the exact setup instruction', async () => {
  const { run, log } = await fixture();
  await expect(run(['ask', 'What is an index?'])).rejects.toMatchObject({
    code: 2,
    stderr: 'Run ./sourced init first.\n',
  });
  await expect(readFile(log)).rejects.toMatchObject({ code: 'ENOENT' });
});
test('TC-214: first init bootstraps an empty env and preserves flags in a one-off non-TTY container', async () => {
  const { root, run, log } = await fixture();
  const result = await run(['init', '--example', '--profile', 'local', '--yes', '--json']);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain('first run takes a few minutes');
  expect(await readFile(path.join(root, '.env.local'), 'utf8')).toBe('');
  expect((await readFile(log, 'utf8')).split('\n')).toEqual([
    'CALL',
    'compose',
    'build',
    'cli',
    'CALL',
    'compose',
    'run',
    '--rm',
    '-T',
    'cli',
    'init',
    '--example',
    '--profile',
    'local',
    '--yes',
    '--json',
    '',
  ]);
});
test('TC-214: external folders (including an unterminated last line) mount read-only with literal arguments', async () => {
  const { root, run, log } = await fixture();
  await writeFile(path.join(root, '.env.local'), '');
  await mkdir(path.join(root, '.sourced'));
  await writeFile(
    path.join(root, '.sourced/mounts'),
    '/tmp/my docs\n/tmp/literal $(touch SHOULD_NOT_EXIST)',
  );
  const question = 'What does $(touch SHOULD_NOT_EXIST) mean?';
  await run(['ask', question, '--json']);
  const args = (await readFile(log, 'utf8')).split('\n');
  expect(args).toContain('/tmp/my docs:/tmp/my docs:ro');
  expect(args).toContain(
    '/tmp/literal $(touch SHOULD_NOT_EXIST):/tmp/literal $(touch SHOULD_NOT_EXIST):ro',
  );
  expect(args.slice(-5)).toEqual(['cli', 'ask', question, '--json', '']);
});
test('TC-214: down never deletes volumes', async () => {
  const { root, run, log } = await fixture();
  await writeFile(path.join(root, '.env.local'), '');
  await run(['down']);
  expect(await readFile(log, 'utf8')).toBe('CALL\ncompose\ndown\n');
});
test('TC-214: dev recreates the app, waits for health inside Docker, then prints its URL', async () => {
  const { root, run, log } = await fixture();
  await writeFile(path.join(root, '.env.local'), '');
  expect((await run(['dev'])).stdout).toBe('http://localhost:3000\n');
  const calls = await readFile(log, 'utf8');
  expect(calls).toContain('compose\nup\n-d\n--build\n--force-recreate\napp');
  expect(calls).toContain('compose\nexec\n-T\napp\nnode');
  expect(calls).toContain('/api/health');
});
test('TC-214: Docker build context excludes environment files, host dependencies, configuration and corpus', async () => {
  const ignored = (await readFile('.dockerignore', 'utf8')).split('\n');
  for (const name of [
    '.env',
    '.env.*',
    '**/.env.*',
    'node_modules',
    '.sourced',
    'corpus',
    'sourced.config.ts',
  ])
    expect(ignored).toContain(name);
  const image = await readFile('Dockerfile', 'utf8');
  expect(image).toMatch(/FROM node:22-bookworm-slim@sha256:[a-f0-9]{64}/);
  expect(image).toContain('USER sourced');
});

test('TC-214 / FR-77: dev --json has one envelope and honors --port', async () => {
  const { root, run } = await fixture();
  await writeFile(path.join(root, '.env.local'), '');
  const { stdout } = await run(['dev', '--port', '3186', '--json']);
  expect(stdout.trim().split('\n')).toHaveLength(1);
  expect(JSON.parse(stdout)).toEqual({
    schemaVersion: 1,
    command: 'dev',
    ok: true,
    result: { url: 'http://localhost:3186' },
    warnings: [],
  });
});

test('TC-214: doctor without Docker prints its platform install link and exits 2', async () => {
  const { root, run } = await fixture();
  await rm(path.join(root, 'bin/docker'));
  await expect(run(['doctor'])).rejects.toMatchObject({
    code: 2,
    stderr: expect.stringMatching(/^Install Docker: https:\/\/docs\.docker\.com\//) as unknown,
  });
  await expect(readFile(path.join(root, '.env.local'))).rejects.toMatchObject({ code: 'ENOENT' });
});

test('TC-214 / TRD §35.2: app refuses to start before init, even though db can run without an env file', async () => {
  const { root } = await fixture();
  await expect(
    execute('/bin/sh', [path.resolve('scripts/docker-entrypoint.sh'), 'app'], { cwd: root }),
  ).rejects.toMatchObject({ code: 2, stderr: 'Run ./sourced init first.\n' });
});
