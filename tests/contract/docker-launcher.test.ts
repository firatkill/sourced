// TC-214 / FR-94; TRD §35.3: exercise the POSIX launcher without a Docker daemon.
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { CliEnvelope } from '@/lib/cli/envelope';
import { commandSchemas } from '@/lib/cli/schemas/commands';

const execute = promisify(execFile);
const directories: string[] = [];
async function fixture(
  downExitCode = 0,
  devFailure: 'up' | 'exec' | 'build' | 'run' | '' = '',
  failureOutput = 'Compose stderr',
  cliOutput = '',
  cliExit = 0,
) {
  const root = await mkdtemp(path.join(tmpdir(), 'sourced-docker-'));
  directories.push(root);
  await copyFile('sourced', path.join(root, 'sourced'));
  await mkdir(path.join(root, 'bin'));
  for (const command of [
    'dirname',
    'uname',
    'id',
    'touch',
    'sed',
    'tail',
    'tr',
    'od',
    'cat',
    'sleep',
    'rm',
    'mkdir',
    'mv',
  ])
    await symlink(
      execFileSync('/bin/sh', ['-c', `command -v ${command}`], { encoding: 'utf8' }).trim(),
      path.join(root, 'bin', command),
    );
  const log = path.join(root, 'arguments');
  await writeFile(
    path.join(root, 'bin/docker'),
    `#!/bin/sh
printf '%s\\n' "$BUILDX_NO_DEFAULT_ATTESTATIONS" >> "$DOCKER_ATTESTATION_LOG"
printf "%s\\n" CALL "$@" >> "$DOCKER_ARGUMENT_LOG"
printf '%s\\n' "SOURCED_PORT=$SOURCED_PORT" "SOURCED_DB_PORT=$SOURCED_DB_PORT" "UNRELATED=$UNRELATED" > "$DOCKER_ENV_LOG"
printf '%s\\n' "$COMPOSE_PROJECT_NAME" >> "$DOCKER_PROJECT_LOG"
if [ "$1" = ps ]; then
  printf '%s' "$FAKE_DOCKER_PS"
  exit 0
fi
if [ "$2" = ps ]; then
  case "$*" in
    *running*) [ "$FAKE_APP_STATE" = exited ] || printf '%s\\n' app-id ;;
    *exited*) [ "$FAKE_APP_STATE" != exited ] || printf '%s\\n' app-id ;;
  esac
  exit 0
fi
if [ "$2" = logs ]; then
  printf '%s\\n' 'app-1  | last log line'
  exit 0
fi
if [ "$2" = '${devFailure}' ]; then
  printf '%s\\n' 'Compose stdout'
  printf '%s\\n' '${failureOutput}' >&2
  exit 17
fi
if [ "$2" = run ]; then
  printf '%s' '${cliOutput}'
  exit ${String(cliExit)}
fi
if [ "$2" = down ] || [ "$4" = down ]; then
  printf '%s\\n' 'Compose stdout'
  printf '%s\\n' 'Compose stderr' >&2
  exit ${String(downExitCode)}
fi
`,
    { mode: 0o755 },
  );
  const run = (args: string[], variables: Record<string, string> = {}) =>
    execute('/bin/sh', [path.join(root, 'sourced'), ...args], {
      env: {
        NODE_ENV: 'test',
        PATH: path.join(root, 'bin'),
        DOCKER_ARGUMENT_LOG: log,
        DOCKER_ATTESTATION_LOG: path.join(root, 'attestations'),
        DOCKER_ENV_LOG: path.join(root, 'port-environment'),
        DOCKER_PROJECT_LOG: path.join(root, 'projects'),
        // Most tests pin the project; the D-136 tests below clear it.
        COMPOSE_PROJECT_NAME: 'sourced-test',
        SOURCED_DEV_ATTEMPTS: '3',
        SOURCED_DEV_INTERVAL: '0',
        ...variables,
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
    stderr: 'Run ./sourced dev first, then finish setup in your browser.\n',
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
    'up',
    '-d',
    '--wait',
    'db',
    'CALL',
    'compose',
    'run',
    '--no-deps',
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
  expect(await readFile(log, 'utf8')).toBe('CALL\ncompose\n--profile\ndocling\ndown\n');
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
    fix: 'Check Docker is running, then retry',
  },
  exec: {
    code: 'INTERNAL_ERROR',
    message: 'The app did not start.',
    fix: 'Run docker compose logs app to see why, then retry ./sourced dev --json.',
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
  expect(await readFile(log, 'utf8')).toBe('CALL\ncompose\n--profile\ndocling\ndown\n');
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
  expect(branch).toContain('if "%json%"=="false" (\n  docker compose --profile docling down\n  exit /b\n)');
  expect(branch).toContain('docker compose --profile docling down 1>&2\nif errorlevel 1 (');
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
    // Compose progress stays visible on stderr in JSON mode (reviewer, D-135).
    expect(result.stderr).toBe(step === 'up' ? 'Compose stdout\nCompose stderr\n' : '');
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
      stdout: '',
      stderr:
        step === 'up'
          ? 'Compose stdout\nCompose stderr\n'
          : 'The app did not start. Its last log lines:\napp-1  | last log line\nNext: docker compose logs app\n',
    });
  },
);

test('TC-214 / NFR-22 / D-137: Windows dev has equivalent failure envelopes and exits', async () => {
  const launcher = await readFile('sourced.cmd', 'utf8');
  const branch = launcher.split('\n:dev\n')[1] ?? '';
  expect(branch).toContain('"App container start" compose up -d --build --force-recreate app');
  expect(branch).toContain('del /q .sourced\\startup-error.json');
  expect(branch).toContain('scripts\\sourced-dev.ps1" "%json%" "%SOURCED_PORT%"');
  const helper = await readFile('scripts/sourced-dev.ps1', 'utf8');
  expect(helper).toContain('/api/health');
  expect(helper).toContain('--status exited app');
  expect(helper).toContain('.sourced\\startup-error.json');
  expect(helper).toContain('Stop it with sourced.cmd down');
  const failures = [...helper.matchAll(/Write-Output '(\{[^\n]+\})'/g)].map((match) =>
    CliEnvelope.parse(JSON.parse(match[1] ?? '')),
  );
  expect(failures).toEqual(
    [devFailures.exec].map((error) => ({
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
  expect((await run(['dev'])).stdout).toBe(
    'Sourced is running at http://localhost:3000\nStop it with ./sourced down\n',
  );
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

test('T-88: the app container starts without .env.local; startup decides setup mode', async () => {
  const entrypoint = await readFile('scripts/docker-entrypoint.sh', 'utf8');
  expect(entrypoint).not.toContain('Create .env.local first');
  expect(entrypoint).toContain('--env-file-if-exists=.env.local /app/scripts/app-startup.ts');
});

const SETUP_LINK = /^http:\/\/localhost:(\d+)\/setup\?token=([0-9a-f]{48})$/;
test('T-88: dev on a fresh checkout creates a private .env.local and prints the setup link', async () => {
  const { root, run } = await fixture();
  await mkdir(path.join(root, '.sourced'));
  // The app container writes these at startup when no provider key is saved.
  await writeFile(path.join(root, '.sourced/setup-token'), `${'a1'.repeat(24)}\n`);
  await writeFile(path.join(root, '.sourced/setup-pending'), '');
  const { stdout } = await run(['dev']);
  expect(stdout).toBe(
    `Sourced is running. Finish setup in your browser:\nhttp://localhost:3000/setup?token=${'a1'.repeat(24)}\nStop it with ./sourced down\n`,
  );
  expect((await stat(path.join(root, '.env.local'))).mode & 0o777).toBe(0o600);
  const json = CliEnvelope.parse(
    JSON.parse((await run(['dev', '--port', '3187', '--json'])).stdout),
  );
  expect(commandSchemas.dev.parse(json.result)).toEqual({
    url: 'http://localhost:3187',
    setupUrl: `http://localhost:3187/setup?token=${'a1'.repeat(24)}`,
  });
});

test('T-88: setup prints a new link each time and keeps the token private', async () => {
  const { root, run, log } = await fixture();
  const first = (await run(['setup'])).stdout.split('\n');
  expect(first[0]).toBe('Open this link to finish setup in your browser:');
  expect(first[2]).toBe('It replaces any earlier link.');
  const token = SETUP_LINK.exec(first[1] ?? '')?.[2];
  expect(token).toBeDefined();
  const file = path.join(root, '.sourced/setup-token');
  expect((await readFile(file, 'utf8')).trim()).toBe(token);
  expect((await stat(file)).mode & 0o777).toBe(0o600);
  const envelope = CliEnvelope.parse(
    JSON.parse((await run(['setup', '--port', '3190', '--json'])).stdout),
  );
  const { url } = commandSchemas.setup.parse(envelope.result);
  expect(SETUP_LINK.exec(url)?.[1]).toBe('3190');
  expect(SETUP_LINK.exec(url)?.[2]).not.toBe(token);
  expect(await readFile(path.join(root, '.env.local'), 'utf8')).toBe('');
  // No container is needed to issue a link.
  await expect(readFile(log)).rejects.toMatchObject({ code: 'ENOENT' });
});

test('T-88: Windows dev and setup print the same links', async () => {
  const launcher = await readFile('sourced.cmd', 'utf8');
  expect(launcher).toContain('if not "%~1"=="dev" if not "%~1"=="setup"');
  expect(launcher).toContain('if "%~1"=="setup" goto setup');
  expect(launcher).toContain('scripts\\sourced-setup.ps1" -Json %json% -Port %SOURCED_PORT%');
  const helper = await readFile('scripts/sourced-setup.ps1', 'utf8');
  expect(helper).toContain('GetBytes($bytes)');
  expect(helper).toContain("'.sourced\\setup-token'");
  expect(helper).toContain('It replaces any earlier link.');
  const dev = await readFile('scripts/sourced-dev.ps1', 'utf8');
  expect(dev).toContain('.sourced\\setup-pending');
  expect(dev).toContain('Finish setup in your browser:');
});

// D-135 / FR-77: all pre-CLI Compose boundaries preserve the JSON contract.
test.each(['build', 'up', 'run'] as const)(
  'D-135: %s failure has one envelope and exit 1',
  async (step) => {
    const { run } = await fixture(0, step);
    const result = await run(['doctor', '--no-network', '--json']).catch((error: unknown) => {
      expect(error).toMatchObject({ code: 1 });
      return error as { stdout: string; stderr: string };
    });
    expect(result.stdout.trim().split('\n')).toHaveLength(1);
    expect(CliEnvelope.parse(JSON.parse(result.stdout))).toEqual({
      schemaVersion: 1,
      command: 'doctor',
      ok: false,
      warnings: [],
      error: {
        code: 'INTERNAL_ERROR',
        message: `${{ build: 'CLI image build', up: 'Database container start', run: 'CLI container start' }[step]} failed.`,
        fix: 'Check Docker is running, then retry',
      },
    });
    expect(result.stdout).not.toContain('Compose stdout');
  },
);
test.each(['port is already allocated', 'address already in use', 'Ports are not available'])(
  'D-135: port collision %s gives both variable names',
  async (message) => {
    const { run } = await fixture(0, 'up', message);
    const result = await run(['doctor', '--json']).catch(
      (error: unknown) => error as { stdout: string },
    );
    const envelope = CliEnvelope.parse(JSON.parse(result.stdout));
    expect(envelope.error?.fix).toContain('SOURCED_DB_PORT');
    expect(envelope.error?.fix).toContain('SOURCED_PORT');
    expect(envelope.error?.fix).toBe(
      'Set SOURCED_DB_PORT (or SOURCED_PORT) to a free port in .env.local, then retry.',
    );
  },
);
test.each([0, 1, 2, 130])(
  'D-135: CLI envelope and exit %i are preserved without a second envelope',
  async (code) => {
    const envelope = {
      schemaVersion: 1,
      command: 'doctor',
      ok: code === 0,
      warnings: [],
      result: { checks: [] },
    };
    const { run } = await fixture(0, '', '', JSON.stringify(envelope) + '\n', code);
    const result = await run(['doctor', '--json']).then(
      (output) => ({ ...output, code: 0 }),
      (error: unknown) => error as { stdout: string; code: number },
    );
    expect(result.code).toBe(code);
    expect(result.stdout).toBe(JSON.stringify(envelope) + '\n');
  },
);
test('D-135: Windows covers build, database startup and CLI startup with the JSON boundary', async () => {
  const launcher = await readFile('sourced.cmd', 'utf8');
  const helper = await readFile('scripts/sourced-compose.ps1', 'utf8');
  for (const step of [
    'CLI image build',
    'Database container start',
    'CLI container start',
    'App container start',
  ])
    expect(launcher).toContain(`"${step}" compose`);
  expect(launcher).toContain('compose run --no-deps');
  expect(helper).toContain('ConvertFrom-Json');
  expect(helper).toContain('exit $status');
  expect(helper).toContain("code = 'INTERNAL_ERROR'");
  expect(helper).toContain('exit 1');
  expect(helper).toContain(
    'Set SOURCED_DB_PORT (or SOURCED_PORT) to a free port in .env.local, then retry.',
  );
});
test('D-135: Compose database host port is configurable with the existing default', async () => {
  expect(await readFile('docker-compose.yml', 'utf8')).toContain(
    '127.0.0.1:${SOURCED_DB_PORT:-5433}:5432',
  );
});

test('D-135: CLI progress stays on stderr while the envelope stays on stdout', async () => {
  const progress = '{"event":"progress","message":"Checking database"}';
  const envelope = '{"schemaVersion":1,"command":"doctor","ok":true,"warnings":[]}';
  const { run } = await fixture(0, '', '', `${progress}\n${envelope}\n`);
  const result = await run(['doctor', '--json']);
  expect(result.stdout).toBe(`${envelope}\n`);
  expect(result.stderr).toBe(`${progress}\n`);
});

// D-135 review: only literal port assignments are imported into the host process.
test.each(['\n', '\r\n'])(
  'D-135: ports come from .env.local with %j line endings; other lines stay inert',
  async (newline) => {
    const { root, run } = await fixture();
    await writeFile(
      path.join(root, '.env.local'),
      [
        '# port settings',
        'SOURCED_PORT=3187',
        'SOURCED_DB_PORT=5544',
        'UNRELATED=must-not-be-exported',
        'UNRELATED=$(touch SHOULD_NOT_EXIST)',
        'touch SHOULD_NOT_EXIST',
      ].join(newline),
    );
    const result = await run(['dev', '--json']);
    expect(CliEnvelope.parse(JSON.parse(result.stdout)).result).toEqual({
      url: 'http://localhost:3187',
    });
    expect(await readFile(path.join(root, 'port-environment'), 'utf8')).toBe(
      'SOURCED_PORT=3187\nSOURCED_DB_PORT=5544\nUNRELATED=\n',
    );
    await expect(readFile(path.join(root, 'SHOULD_NOT_EXIST'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(result.stdout + result.stderr).not.toContain('must-not-be-exported');
  },
);
test('D-135: shell port values win over .env.local and --port wins for dev', async () => {
  const { root, run } = await fixture();
  await writeFile(path.join(root, '.env.local'), 'SOURCED_PORT=3187\nSOURCED_DB_PORT=5544');
  const variables = { SOURCED_PORT: '3188', SOURCED_DB_PORT: '5545' };
  expect(JSON.parse((await run(['dev', '--json'], variables)).stdout)).toMatchObject({
    result: { url: 'http://localhost:3188' },
  });
  expect(await readFile(path.join(root, 'port-environment'), 'utf8')).toBe(
    'SOURCED_PORT=3188\nSOURCED_DB_PORT=5545\nUNRELATED=\n',
  );
  expect(
    JSON.parse((await run(['dev', '--port', '3189', '--json'], variables)).stdout),
  ).toMatchObject({ result: { url: 'http://localhost:3189' } });
});
test('D-135: Windows imports only the two port assignments when absent from the shell', async () => {
  const launcher = await readFile('sourced.cmd', 'utf8');
  expect(launcher).toContain(
    `for /f "tokens=1,* delims==" %%A in ('findstr /b /l /c:"SOURCED_PORT=" /c:"SOURCED_DB_PORT=" .env.local') do (`,
  );
  for (const key of ['SOURCED_PORT', 'SOURCED_DB_PORT']) {
    expect(launcher).toContain(`if "%%A"=="${key}" if not defined ${key} set "${key}=%%B"`);
  }
  expect(launcher).not.toContain('set "%%A=%%B"');
});

// Task 64 / FR-94: cached builds retain a stable image manifest.
test.each([undefined, '0', ''])(
  'Task 64: every Compose call receives the attestation setting (caller %j)',
  async (value) => {
    const { root, run } = await fixture();
    await run(
      ['doctor', '--json'],
      value === undefined ? {} : { BUILDX_NO_DEFAULT_ATTESTATIONS: value },
    );
    expect(await readFile(path.join(root, 'attestations'), 'utf8')).toBe(
      Array(3)
        .fill(`${value ?? '1'}\n`)
        .join(''),
    );
  },
);
test('Task 64: Windows defaults attestations before Compose or its PowerShell wrapper', async () => {
  const launcher = await readFile('sourced.cmd', 'utf8');
  const setting =
    'if not defined BUILDX_NO_DEFAULT_ATTESTATIONS set BUILDX_NO_DEFAULT_ATTESTATIONS=1';
  expect(launcher).toContain(setting);
  expect(launcher.indexOf(setting)).toBeLessThan(launcher.indexOf('compose'));
  expect(launcher.indexOf(setting)).toBeLessThan(launcher.indexOf('goto down'));
});

// D-137: the app's own startup failure reaches the user in both modes, without waiting.
const startupFailure = {
  schemaVersion: 1,
  command: 'dev',
  ok: false,
  error: {
    code: 'CORPUS_MISMATCH',
    message: 'The existing index was built with mock:mock-feature-hash.',
    fix: './sourced ingest --rebuild',
  },
  warnings: [],
};
async function failingApp(json: boolean) {
  const { root, run, log } = await fixture();
  await writeFile(path.join(root, '.env.local'), '');
  // The fake container "writes" its startup failure as soon as Compose starts it.
  await writeFile(
    path.join(root, 'bin/docker'),
    (await readFile(path.join(root, 'bin/docker'), 'utf8')).replace(
      'if [ "$2" = ps ]; then',
      `if [ "$2" = up ]; then
  mkdir -p .sourced
  printf '%s\\n' '${JSON.stringify(startupFailure)}' > .sourced/startup-error.json
  printf '%s\\n' 'The app did not start: ${startupFailure.error.message}' 'Next: ${startupFailure.error.fix}' > .sourced/startup-error.txt
  exit 0
fi
if [ "$2" = ps ]; then`,
    ),
  );
  const started = Date.now();
  const result = await run(json ? ['dev', '--json'] : ['dev'], {
    FAKE_APP_STATE: 'exited',
    SOURCED_DEV_ATTEMPTS: '60',
    SOURCED_DEV_INTERVAL: '1',
  }).then(
    () => {
      throw new Error('Expected dev to fail');
    },
    (error: unknown) => error as { code: number; stdout: string; stderr: string },
  );
  return { result, elapsed: Date.now() - started, calls: await readFile(log, 'utf8') };
}
test('D-137: dev --json returns the app startup failure at once', async () => {
  const { result, elapsed, calls } = await failingApp(true);
  expect(result.code).toBe(1);
  expect(CliEnvelope.parse(JSON.parse(result.stdout))).toEqual(startupFailure);
  expect(elapsed).toBeLessThan(5000);
  expect(calls).not.toContain('/api/health');
});
test('D-137: dev in a terminal prints the startup reason and next command', async () => {
  const { result, elapsed } = await failingApp(false);
  expect(result).toMatchObject({
    code: 1,
    stdout: '',
    stderr:
      'The app did not start: The existing index was built with mock:mock-feature-hash.\nNext: ./sourced ingest --rebuild\n',
  });
  expect(elapsed).toBeLessThan(5000);
});
test('D-137: an exited app without a startup file stops the wait early and shows its logs', async () => {
  const { root, run, log } = await fixture();
  await writeFile(path.join(root, '.env.local'), '');
  const started = Date.now();
  await expect(
    run(['dev'], {
      FAKE_APP_STATE: 'exited',
      SOURCED_DEV_ATTEMPTS: '60',
      SOURCED_DEV_INTERVAL: '1',
    }),
  ).rejects.toMatchObject({
    code: 1,
    stderr:
      'The app did not start. Its last log lines:\napp-1  | last log line\nNext: docker compose logs app\n',
  });
  expect(Date.now() - started).toBeLessThan(5000);
  expect(await readFile(log, 'utf8')).not.toContain('/api/health');
});

// D-136: one Compose project per checkout.
test('D-136: a new checkout records a random project in .env and every Compose call uses it', async () => {
  const { root, run } = await fixture();
  await writeFile(path.join(root, '.env.local'), '');
  await writeFile(path.join(root, '.env'), 'KEEP=1');
  await run(['doctor', '--json'], { COMPOSE_PROJECT_NAME: '' });
  const recorded = await readFile(path.join(root, '.env'), 'utf8');
  expect(recorded).toMatch(/^KEEP=1\nCOMPOSE_PROJECT_NAME=sourced-[0-9a-f]{8}\n$/);
  const project = recorded.split('=').at(-1)?.trim() ?? '';
  const projects = (await readFile(path.join(root, 'projects'), 'utf8')).split('\n');
  // The first call is the project lookup itself, before a name exists.
  expect(projects).toEqual(['', project, project, project, '']);
  await run(['doctor', '--json'], { COMPOSE_PROJECT_NAME: '' });
  expect(await readFile(path.join(root, '.env'), 'utf8')).toBe(recorded);
});
test('D-136: an upgraded checkout keeps the project its containers already use', async () => {
  const { root, run } = await fixture();
  await writeFile(path.join(root, '.env.local'), '');
  const { realpath } = await import('node:fs/promises');
  const here = (await realpath(root)).toUpperCase();
  await run(['doctor', '--json'], {
    COMPOSE_PROJECT_NAME: '',
    FAKE_DOCKER_PS: `/elsewhere/sourced|sourced\n${here}|legacy-project\n`,
  });
  expect(await readFile(path.join(root, '.env'), 'utf8')).toBe(
    'COMPOSE_PROJECT_NAME=legacy-project\n',
  );
});
test('D-136: a project set by the user wins and nothing is written', async () => {
  const { root, run } = await fixture();
  await writeFile(path.join(root, '.env.local'), '');
  await run(['doctor', '--json'], { COMPOSE_PROJECT_NAME: 'mine' });
  await expect(readFile(path.join(root, '.env'))).rejects.toMatchObject({ code: 'ENOENT' });
  expect((await readFile(path.join(root, 'projects'), 'utf8')).trim().split('\n')).toEqual(
    Array(3).fill('mine'),
  );
});
test('D-136: Windows records the project before any Compose call', async () => {
  const launcher = await readFile('sourced.cmd', 'utf8');
  const call = 'scripts\\sourced-project.ps1"';
  expect(launcher).toContain(call);
  expect(launcher.indexOf(call)).toBeLessThan(launcher.indexOf('docker compose'));
  expect(launcher).toContain('set "SOURCED_LAUNCHER=sourced.cmd"');
  const helper = await readFile('scripts/sourced-project.ps1', 'utf8');
  expect(helper).toContain('com.docker.compose.project.working_dir');
  expect(helper).toContain("'sourced-'");
  expect(helper).toContain('COMPOSE_PROJECT_NAME=');
});
