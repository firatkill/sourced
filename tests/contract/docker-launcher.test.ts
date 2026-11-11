// TC-214 / FR-94; TRD §35.3: exercise the POSIX launcher without a Docker daemon.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { CliEnvelope } from '@/lib/cli/envelope';
import { commandSchemas } from '@/lib/cli/schemas/commands';

const execute = promisify(execFile);
const directories: string[] = [];
async function fixture(downExitCode = 0, devFailure: 'up' | 'exec' | '' = '') {
  const root = await mkdtemp(path.join(tmpdir(), 'sourced-docker-'));
  directories.push(root);
  await copyFile('sourced', path.join(root, 'sourced'));
  await mkdir(path.join(root, 'bin'));
  for (const command of ['dirname', 'uname', 'id', 'touch'])
    await symlink(`/usr/bin/${command}`, path.join(root, 'bin', command));
  const log = path.join(root, 'arguments');
  await writeFile(
    path.join(root, 'bin/docker'),
    `#!/bin/sh
printf "%s\\n" CALL "$@" >> "$DOCKER_ARGUMENT_LOG"
if [ "$2" = '${devFailure}' ]; then
  printf '%s\\n' 'Compose stdout'
  printf '%s\\n' 'Compose stderr' >&2
  exit 17
fi
if [ "$2" = down ]; then
  printf '%s\\n' 'Compose stdout'
  printf '%s\\n' 'Compose stderr' >&2
  exit ${String(downExitCode)}
fi
`,
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
  expect(await run(['down'])).toMatchObject({
    stdout: 'Compose stdout\n',
    stderr: 'Compose stderr\n',
  });
  expect(await readFile(log, 'utf8')).toBe('CALL\ncompose\ndown\n');
});

const downSuccess = {
  schemaVersion: 1,
  command: 'down',
  ok: true,
  result: {},
  warnings: [],
};
const downFailure = {
  schemaVersion: 1,
  command: 'down',
  ok: false,
  error: {
    code: 'INTERNAL_ERROR',
    message: 'Docker Compose down failed.',
    fix: 'Check Docker is running, then retry ./sourced down --json.',
  },
  warnings: [],
};
const windowsDownFailure = {
  ...downFailure,
  error: { ...downFailure.error, fix: downFailure.error.fix.replace('./sourced', 'sourced.cmd') },
};
const devFailures = {
  up: {
    code: 'INTERNAL_ERROR',
    message: 'App container start failed.',
    fix: 'Check Docker is running and review the start output, then retry ./sourced dev --json.',
  },
  exec: {
    code: 'INTERNAL_ERROR',
    message: 'App health check failed.',
    fix: 'Run docker compose logs app to diagnose the health check, then retry ./sourced dev --json.',
  },
};

test.each([0, 17])('TC-214 / NFR-22: down --json handles Compose exit %i', async (code) => {
  const { root, run, log } = await fixture(code);
  await writeFile(path.join(root, '.env.local'), '');
  const result = await run(['down', '--json']).then(
    (output) => ({ ...output, code: 0 }),
    (error: unknown) => {
      expect(error).toMatchObject({
        code: 1,
        stdout: expect.any(String) as unknown,
        stderr: expect.any(String) as unknown,
      });
      return error as { code: number; stdout: string; stderr: string };
    },
  );
  expect(result.code).toBe(code === 0 ? 0 : 1);
  expect(result.stdout.endsWith('\n')).toBe(true);
  expect(result.stdout.trim().split('\n')).toHaveLength(1);
  const envelope = CliEnvelope.parse(JSON.parse(result.stdout));
  expect(envelope).toEqual(code === 0 ? downSuccess : downFailure);
  if (envelope.ok) expect(commandSchemas.down.parse(envelope.result)).toEqual({});
  expect(result.stderr).toBe('Compose stdout\nCompose stderr\n');
  expect(await readFile(log, 'utf8')).toBe('CALL\ncompose\ndown\n');
});

test('TC-214: down without --json preserves the Compose failure code and output', async () => {
  const { root, run } = await fixture(17);
  await writeFile(path.join(root, '.env.local'), '');
  await expect(run(['down'])).rejects.toMatchObject({
    code: 17,
    stdout: 'Compose stdout\n',
    stderr: 'Compose stderr\n',
  });
});

test('TC-214 / NFR-22: Windows down has the same JSON branch and envelopes', async () => {
  const launcher = await readFile('sourced.cmd', 'utf8');
  expect(launcher).toContain('if "%~1"=="down" goto down');
  const branch = launcher.split('\n:down\n')[1]?.split('\n:dev\n')[0];
  expect(branch).toBeDefined();
  expect(branch).toContain('if "%~1"=="--json" set "json=true"');
  expect(branch).toContain('if "%json%"=="false" (\n  docker compose down\n  exit /b\n)');
  expect(branch).toContain('docker compose down 1>&2\nif errorlevel 1 (');
  const envelopes = [...(branch ?? '').matchAll(/echo (\{[^\n]+\})\n/g)].map((match) =>
    CliEnvelope.parse(JSON.parse(match[1] ?? '')),
  );
  expect(envelopes).toEqual([windowsDownFailure, downSuccess]);
  expect(commandSchemas.down.parse(envelopes[1]?.result)).toEqual({});
  expect(branch).toContain(`${JSON.stringify(windowsDownFailure)}\n  exit /b 1\n)`);
  expect(branch).toContain(`${JSON.stringify(downSuccess)}\nexit /b 0`);
});

test.each(['up', 'exec'] as const)(
  'TC-214 / NFR-22: dev --json reports %s failure with one envelope and exit 1',
  async (step) => {
    const { root, run, log } = await fixture(0, step);
    await writeFile(path.join(root, '.env.local'), '');
    const result = await run(['dev', '--json']).then(
      () => {
        throw new Error('Expected dev to fail');
      },
      (error: unknown) => {
        expect(error).toMatchObject({ code: 1 });
        return error as { stdout: string; stderr: string };
      },
    );
    expect(result.stdout.endsWith('\n')).toBe(true);
    expect(result.stdout.trim().split('\n')).toHaveLength(1);
    expect(CliEnvelope.parse(JSON.parse(result.stdout))).toEqual({
      schemaVersion: 1,
      command: 'dev',
      ok: false,
      error: devFailures[step],
      warnings: [],
    });
    expect(result.stderr).toBe('Compose stdout\nCompose stderr\n');
    const calls = await readFile(log, 'utf8');
    expect(calls).toContain('compose\nup\n');
    if (step === 'up') expect(calls).not.toContain('compose\nexec\n');
    else expect(calls).toContain('/api/health');
  },
);

test.each(['up', 'exec'] as const)(
  'TC-214: dev human %s failure preserves output and exits 1',
  async (step) => {
    const { root, run } = await fixture(0, step);
    await writeFile(path.join(root, '.env.local'), '');
    await expect(run(['dev'])).rejects.toMatchObject({
      code: 1,
      stdout: step === 'up' ? '' : 'Compose stdout\n',
      stderr: step === 'up' ? 'Compose stdout\nCompose stderr\n' : 'Compose stderr\n',
    });
  },
);

test('TC-214 / NFR-22: Windows dev has equivalent failure envelopes and exits', async () => {
  const launcher = await readFile('sourced.cmd', 'utf8');
  const branch = launcher.split('\n:dev\n')[1] ?? '';
  expect(branch).toContain(
    'docker compose up -d --build --force-recreate app 1>&2\nif errorlevel 1 (',
  );
  expect(branch).toContain(
    'if "%json%"=="true" (\n  call :healthcheck 1>&2\n) else (\n  call :healthcheck\n)\nif errorlevel 1 (',
  );
  expect(branch).toContain(':healthcheck\ndocker compose exec -T app node');
  expect(branch).toContain('/api/health');
  const failures = [
    ...branch.matchAll(/if "%json%"=="true" echo (\{[^\n]+\})\n  exit \/b 1\n\)/g),
  ].map((match) => CliEnvelope.parse(JSON.parse(match[1] ?? '')));
  expect(failures).toEqual(
    Object.values(devFailures).map((error) => ({
      schemaVersion: 1,
      command: 'dev',
      ok: false,
      error: { ...error, fix: error.fix.replace('./sourced', 'sourced.cmd') },
      warnings: [],
    })),
  );
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
  const envelope = CliEnvelope.parse(JSON.parse(stdout));
  expect(commandSchemas.dev.parse(envelope.result)).toEqual({ url: 'http://localhost:3186' });
  expect(envelope).toEqual({
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
