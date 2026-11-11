import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { getCliSecrets } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { CliEnvelope } from '@/lib/cli/envelope';
import { commandSchemas } from '@/lib/cli/schemas/commands';
import { IngestResult, emptyCounters, sumCounters } from '@/lib/cli/schemas/ingest';
import { dispatch, parseInvocation } from '@/lib/cli/router';
import { confirmAction } from '@/lib/cli/prompts';
import { formatEnvelope, redact } from '@/lib/cli/output';
import { RobotsDisallowedError } from '@/lib/ingest/robots';

const root = process.cwd();
let directory: string;
const secret = 'sk-test-UT45-super-secret-0123456789';
const other = 'UT45-provider-secret-9876543210';
const environment: NodeJS.ProcessEnv = {
  // Only executable discovery is inherited; no application or .env.local values.
  PATH: process.env.PATH,
  LLM_MODE: 'mock',
  DATABASE_URL: 'postgres://unit:sourced@127.0.0.1:1/ut45',
  MIGRATION_DATABASE_URL: 'postgres://unit:sourced@127.0.0.1:1/ut45',
  NODE_ENV: 'test',
  // Invalid runtime settings keep dev/ask/ingest from starting services in UT-45.
  NEXT_PUBLIC_SITE_URL: 'invalid-unit-test-url',
  OPENAI_API_KEY: secret,
  GOOGLE_GENERATIVE_AI_API_KEY: other,
  ANTHROPIC_API_KEY: other,
  SOURCED_ACCESS_TOKEN: other,
  QUESTION_HASH_SALT: other,
  IP_HASH_SALT: other,
};
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'sourced-cli-unit-'));
  const snapshot = z
    .object({ config: z.unknown() })
    .parse(JSON.parse(await readFile('.sourced/config.json', 'utf8')));
  await writeFile(
    join(directory, 'sourced.config.ts'),
    `export default ${JSON.stringify(snapshot.config)};\n`,
  );
});
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});
const invocations = [
  ['doctor', '--no-network'],
  ['init', '--example'],
  ['add', './docs', '--type', 'folder'],
  ['sources', 'list'],
  ['sources', 'remove', 'example', '--yes'],
  ['ingest', '--offline'],
  ['inspect'],
  ['ask', 'What is a transaction?', '--trace'],
  ['eval:generate', '--count', '5'],
  ['eval:review', '--apply'],
  ['eval', '--no-write'],
  ['dev', '--port', '3000'],
  ['down'],
  ['deploy:check', '--profile', 'local'],
  ['config:snapshot'],
];
describe('TC-202 / UT-45 / FR-77: real CLI output contains no secrets', () => {
  test.each(
    invocations.flatMap((args) =>
      [true, false].map((json) => [args.join(' ') + (json ? '' : ' (human)'), args, json] as const),
    ),
  )('%s', (_name, args, json) => {
    const child = spawnSync(
      process.execPath,
      [
        resolve('node_modules/tsx/dist/cli.mjs'),
        '--tsconfig',
        join(root, 'tsconfig.json'),
        '--conditions=react-server',
        join(root, 'scripts/sourced.ts'),
        ...args,
        ...(json ? ['--json'] : []),
      ],
      { cwd: directory, env: environment, encoding: 'utf8' },
    );
    expect(child.error).toBeUndefined();
    expect(child.signal).toBeNull();
    const output = child.stdout + child.stderr;
    for (const key of [secret, other, 'UT45-super-secret', 'UT45-provider-secret'])
      expect(output).not.toContain(key);
    if (json) {
      expect(child.stdout.trim().split('\n')).toHaveLength(1);
      const envelope = CliEnvelope.parse(JSON.parse(child.stdout));
      if (envelope.ok) commandSchemas[parseInvocation([...args]).command].parse(envelope.result);
      expect([0, 1, 2]).toContain(child.status);
      expect(envelope.ok).toBe(child.status === 0);
      const normalized = JSON.parse(
        child.stdout
          .replace(/[a-f0-9]{64}/g, '<configHash>')
          .replace(/Node [^;]+; pnpm [^.]+\.[^.]+\.[^.]+\./g, 'Node <version>; pnpm <version>.'),
      ) as unknown;
      expect({ exit: child.status, envelope: normalized }).toMatchSnapshot();
      for (const line of child.stderr.trim().split('\n').filter(Boolean))
        expect(JSON.parse(line)).toHaveProperty('event');
    } else if (child.status !== 0)
      expect(child.stdout.trim().split('\n').at(-1)).toMatch(/^Next: /);
  });
});
test('UT-45 / NFR-22: versioned envelope and per-command schemas are pinned', () => {
  expect(z.toJSONSchema(CliEnvelope)).toMatchSnapshot();
  for (const [name, schema] of Object.entries(commandSchemas))
    expect(z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' })).toMatchSnapshot(name);
});
test('UT-45: confirmation is never requested in JSON, non-TTY or --yes modes', async () => {
  const prompt = vi.fn().mockResolvedValue(true);
  for (const options of [
    { yes: false, json: true, isTTY: true },
    { yes: false, json: false, isTTY: false },
  ])
    await expect(confirmAction({ ...options, message: 'Rebuild?', prompt })).rejects.toMatchObject({
      code: 'NEEDS_CONFIRMATION',
    });
  await confirmAction({ yes: true, json: false, isTTY: true, message: 'Rebuild?', prompt });
  expect(prompt).not.toHaveBeenCalled();
  await confirmAction({ yes: false, json: false, isTTY: true, message: 'Rebuild?', prompt });
  expect(prompt).toHaveBeenCalledExactlyOnceWith('Rebuild?');
  await expect(
    confirmAction({
      yes: false,
      json: false,
      isTTY: true,
      message: 'Rebuild?',
      prompt: () => Promise.resolve(false),
    }),
  ).rejects.toMatchObject({ code: 'NEEDS_CONFIRMATION' });
});
test('UT-45: exit codes, destructive confirmation and safe failures', async () => {
  const context = { progress: vi.fn(), isTTY: false };
  const handler = vi.fn().mockResolvedValue({ result: { checks: [] } });
  expect((await dispatch(['doctor'], context, handler)).exitCode).toBe(0);
  for (const args of [
    ['ingest', '--rebuild'],
    ['sources', 'remove', 'docs'],
  ]) {
    handler.mockClear();
    expect((await dispatch([...args, '--json'], context, handler)).exitCode).toBe(2);
    expect(handler).not.toHaveBeenCalled();
  }
  for (const code of [
    'NEEDS_CONFIRMATION',
    'CHECKS_FAILED',
    'CORPUS_MISMATCH',
    'CORPUS_EMPTY',
  ] as const)
    expect(
      (await dispatch(['doctor'], context, () => Promise.reject(new AppError(code, secret))))
        .exitCode,
    ).toBe(2);
  expect(
    (
      await dispatch(['doctor'], context, () =>
        Promise.reject(new RobotsDisallowedError('https://example.test')),
      )
    ).exitCode,
  ).toBe(2);
  expect(
    (
      await dispatch(['doctor'], context, () =>
        Promise.reject(Object.assign(new Error(), { name: 'ExitPromptError' })),
      )
    ).exitCode,
  ).toBe(130);
  const unexpected = await dispatch(['doctor'], context, () => Promise.reject(new Error(secret)));
  expect(unexpected.exitCode).toBe(1);
  expect(JSON.stringify(unexpected)).not.toContain(secret);
  expect(
    (await dispatch(['doctor'], context, () => Promise.resolve({ result: { checks: 'invalid' } })))
      .exitCode,
  ).toBe(1);
  expect((await dispatch(['doctor', '--invalid'], context)).exitCode).toBe(1);
});
test('UT-45: redaction handles secrets, credentials and JSON escaping', () => {
  expect(
    redact(`value ${secret} https://user:password@example.test sk-unknown-123`, [secret]),
  ).toBe('value [REDACTED] https://[REDACTED]@example.test [REDACTED]');
  const envelope = CliEnvelope.parse({
    schemaVersion: 1,
    command: 'doctor',
    ok: false,
    error: { code: 'INTERNAL_ERROR', message: 'Check failed.', fix: 'pnpm sourced doctor' },
  });
  expect(formatEnvelope(envelope, false)).toBe('Check failed.\nNext: pnpm sourced doctor\n');
  expect(JSON.parse(formatEnvelope(envelope, true))).toEqual(envelope);
});
test('TC-203: aliases and documented flags remain registered', async () => {
  const pkg = z
    .object({
      scripts: z.record(z.string(), z.string()),
      dependencies: z.record(z.string(), z.string()),
      devDependencies: z.record(z.string(), z.string()),
    })
    .parse(JSON.parse(await readFile('package.json', 'utf8')));
  expect(pkg.scripts.ingest).toBe('pnpm sourced ingest');
  expect(pkg.scripts.eval).toBe('pnpm sourced eval');
  expect(pkg.scripts['eval:validate']).toBe('pnpm sourced eval --validate-only');
  expect(pkg.dependencies.tsx).toBe('4.23.15');
  expect(pkg.devDependencies.tsx).toBeUndefined();
  expect(pkg.dependencies['@inquirer/prompts']).toBe('8.7.5');
  expect(
    parseInvocation(['ingest', '--source', 'docs', '--offline', '--json']).values,
  ).toMatchObject({ source: 'docs', offline: true, json: true });
  expect(
    parseInvocation([
      'eval',
      '--limit',
      '1',
      '--only',
      'q001',
      '--baseline',
      'baseline.json',
      '--no-write',
    ]).command,
  ).toBe('eval');
});
test('D-109: dry-run shape and totals preserve unknown prices and zero future counters', () => {
  const a = { ...emptyCounters(), id: 'a', embeddingTokens: 10, estimatedCostUsd: null };
  const b = { ...emptyCounters(), id: 'b', embeddingTokens: 20, estimatedCostUsd: 0.2 };
  const totals = sumCounters([a, b]);
  expect(totals).toMatchObject({
    embeddingTokens: 30,
    estimatedCostUsd: null,
    boilerplateRemoved: 0,
  });
  expect(
    IngestResult.parse({
      mode: 'dry-run',
      runId: null,
      corpusVersion: null,
      sources: [a, b],
      totals,
    }).runId,
  ).toBeNull();
});

test.each(['doctor', 'deploy:check'])(
  'D-115 / UT-45: %s lists every failed check and fix, with CHECKS_FAILED exit 2',
  async (command) => {
    const checks = [
      { id: 'config', ok: true, detail: 'Configuration valid.' },
      { id: 'ports', ok: false, detail: 'Occupied.', fix: 'Free port 3000.' },
      { id: 'keys', ok: false, detail: 'Missing key.', fix: 'Set OPENAI_API_KEY in .env.local.' },
    ];
    const output = await dispatch([command, '--json'], { isTTY: false, progress: vi.fn() }, () =>
      Promise.resolve({ result: { checks }, exitCode: 2 }),
    );
    expect(output.exitCode).toBe(2);
    expect(output.envelope.error).toEqual({
      code: 'CHECKS_FAILED',
      message: 'ports: Free port 3000.\nkeys: Set OPENAI_API_KEY in .env.local.',
      fix: 'Free port 3000.',
    });
    expect(output.envelope.result).toEqual({ checks });
    const passed = await dispatch([command, '--json'], { isTTY: false, progress: vi.fn() }, () =>
      Promise.resolve({ result: { checks: [checks[0]] } }),
    );
    expect(passed.exitCode).toBe(0);
    expect(passed.envelope.error).toBeUndefined();
  },
);

test.each(['sourced', 'postgres', 'admin'])(
  'UT-45: database password %s cannot corrupt ordinary text',
  (password) => {
    const previous = process.env;
    try {
      process.env = {
        NODE_ENV: 'test',
        DATABASE_URL: `postgres://unit:${password}@localhost:5433/unit`,
      };
      const secrets = getCliSecrets();
      expect(secrets).not.toContain(password);
      expect(redact('pnpm sourced ingest; Edit sourced.config.ts; postgres admin', secrets)).toBe(
        'pnpm sourced ingest; Edit sourced.config.ts; postgres admin',
      );
      expect(redact(process.env.DATABASE_URL ?? '', secrets)).toBe('[REDACTED]');
      expect(redact(`https://unit:${password}@example.test/path`, secrets)).toBe(
        'https://[REDACTED]@example.test/path',
      );
    } finally {
      process.env = previous;
    }
  },
);
test('UT-45: full long secrets are redacted wherever they appear, including embedded text', () => {
  expect(redact(`prefix${secret}suffix ${secret} ${other}`, [secret, other])).toBe(
    'prefix[REDACTED]suffix [REDACTED] [REDACTED]',
  );
  expect(redact('pnpm sourced ingest admin', ['sourced', 'admin'])).toBe(
    'pnpm sourced ingest admin',
  );
  expect(redact('abcdefgh', ['abcdefgh'])).toBe('[REDACTED]');
});
test('UT-45: database URLs are removed whole, including encoded passwords', () => {
  const url = 'postgresql://unit:long%40password@localhost:5433/unit?sslmode=require';
  expect(redact(`Database: ${url}`, [url])).toBe('Database: [REDACTED]');
  expect(redact(`Database: ${url}`, [])).toBe('Database: [REDACTED]');
});
