// T-63 / TRD §39.3: real CLI processes, integration DB, mock providers.
// CT ids follow the 14 rows of §34.1; sources list/remove share CT-04.
import { createServer } from 'node:http';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { CliEnvelope } from '@/lib/cli/envelope';
import { commandSchemas } from '@/lib/cli/schemas/commands';
import { parseInvocation } from '@/lib/cli/router';
import { SourceSchema } from '@/lib/kit/config-schema';
import { getKitConfig, setCliKitConfig } from '@/lib/kit/runtime-config';
import { getSql } from '@/lib/db/client';
import { requireLocalDatabase } from '../../helpers/local-database';
import { createSseParser } from '@/lib/sse/parse';
import { SseEvent } from '@/lib/sse/events';
import { POST } from '@/app/api/ask/route';

const callbacks = vi.hoisted(() => [] as Array<() => Promise<void>>);
vi.mock('next/server', () => ({
  after: (callback: () => Promise<void>) => callbacks.push(callback),
}));
const execute = promisify(execFile);
const root = process.cwd();
const args = [
  '--import',
  resolve('node_modules/tsx/dist/loader.mjs'),
  '--conditions=react-server',
  resolve('scripts/sourced.ts'),
];
const directories: string[] = [];
const template = getKitConfig(false);
beforeEach(async () => {
  await getSql()`TRUNCATE documents, chunks, corpus_meta, query_log RESTART IDENTITY CASCADE`;
});
afterAll(async () => {
  for (const dir of directories) await rm(dir, { recursive: true, force: true });
});
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'sourced-contract-'));
  directories.push(dir);
  // Match the real kit package boundary for TypeScript config imports.
  await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
  const config = structuredClone(template);
  config.profile = 'local';
  config.sources = [];
  await writeFile(join(dir, 'sourced.config.ts'), `export default ${JSON.stringify(config)};\n`);
  const url = requireLocalDatabase(process.env.TEST_DATABASE_URL);
  const env = {
    PATH: process.env.PATH,
    TSX_TSCONFIG_PATH: resolve('tsconfig.json'),
    NODE_ENV: 'test' as const,
    QUESTION_HASH_SALT: 'test-only-question-salt-0000000000000000',
    IP_HASH_SALT: 'test-only-ip-salt-00000000000000000000000',
    NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
    LOG_LEVEL: 'silent',
    OPENAI_API_KEY: '',
    GOOGLE_GENERATIVE_AI_API_KEY: '',
    ANTHROPIC_API_KEY: '',

    LLM_MODE: 'mock',
    DATABASE_URL: url,
    MIGRATION_DATABASE_URL: url,
    MOCK_STREAM_DELAY_MS: '0',
  };
  const cli = async (
    command: string[],
    expected: number | number[] = 0,
    overrides: Record<string, string> = {},
  ) => {
    let output: { stdout: string; stderr: string };
    let status = 0;
    try {
      output = await execute(process.execPath, [...args, ...command, '--json'], {
        cwd: dir,
        env: { ...env, ...overrides },
      });
    } catch (error) {
      const failed = z
        .object({ stdout: z.string(), stderr: z.string(), code: z.number() })
        .parse(error);
      output = failed;
      status = failed.code;
    }
    expect(Array.isArray(expected) ? expected : [expected], output.stdout).toContain(status);
    expect(output.stdout.trim().split('\n')).toHaveLength(1);
    const envelope = CliEnvelope.parse(JSON.parse(output.stdout));
    expect(envelope.ok).toBe(status === 0);
    if (status === 0) expect(envelope.error).toBeUndefined();
    let name = 'sourced';
    try {
      name = parseInvocation(command).command;
    } catch {
      /* Invalid arguments fail before dispatch. */
    }
    expect(envelope.command).toBe(name);
    if (envelope.result !== undefined)
      commandSchemas[parseInvocation(command).command].parse(envelope.result);
    if (!envelope.ok) expect(envelope.error?.fix).toBeTruthy();
    for (const line of output.stderr.trim().split('\n').filter(Boolean))
      expect(JSON.parse(line)).toHaveProperty('event');
    return envelope;
  };
  return { dir, config, cli, env };
}
test('CT-02 init / FR-79, D-113–114: flags-only, dimensions, token preservation, overwrite refusal', async () => {
  const { dir, cli } = await fixture();
  await rm(join(dir, 'sourced.config.ts'));
  const flags = [
    'init',
    '--corpus-name',
    'fixture',
    '--title',
    'Fixture',
    '--description',
    'Fixture docs',
    '--language',
    'en',
    '--chat',
    'mock:mock',
    '--embed',
    'mock:mock-feature-hash:768',
    '--profile',
    'private',
  ];
  for (const malformed of ['openai:text-embedding-3-small', 'openai:text-embedding-3-small:no']) {
    const invalid = [...flags];
    invalid[invalid.indexOf('--embed') + 1] = malformed;
    const error = (await cli(invalid, 1)).error;
    expect(error?.code).toBe('CONFIG_INVALID');
    expect(error?.message).toContain('models.embed.dimensions');
    expect(error?.message).toContain('--embed');
    expect(error?.message).toContain('provider:model:dims');
    expect(error?.message).toContain('openai:text-embedding-3-small:1536');
    await expect(readFile(join(dir, 'sourced.config.ts'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  }
  // A reachable CI service database must not require Docker on PATH (D-119).
  const first = await cli(flags, 0, { PATH: '/nonexistent' });
  expect(commandSchemas.init.parse(first.result).database).toBe('running');
  const before = await readFile(join(dir, '.env.local'), 'utf8');
  expect(before).toMatch(/SOURCED_ACCESS_TOKEN=[A-Za-z0-9_-]{32}\n/);
  expect(JSON.stringify(first)).not.toContain(before.match(/SOURCED_ACCESS_TOKEN=(.+)/)?.[1]);
  expect(
    (await getSql()<{ embed_dimensions: number }[]>`SELECT embed_dimensions FROM corpus_meta`)[0]
      ?.embed_dimensions,
  ).toBe(768);
  expect((await cli(flags, 2)).error?.code).toBe('NEEDS_CONFIRMATION');
  await cli([...flags, '--yes']);
  expect(await readFile(join(dir, '.env.local'), 'utf8')).toBe(before);
  expect(
    commandSchemas['sources list'].parse((await cli(['sources', 'list'])).result).sources,
  ).toEqual([]);
});
test('CT-02 init / D-117: example sources survive initialization and replacement requires --yes', async () => {
  const { cli } = await fixture();
  expect((await cli(['init', '--example', '--profile', 'local'], 2)).error?.code).toBe(
    'NEEDS_CONFIRMATION',
  );
  await cli(['init', '--example', '--profile', 'local', '--yes']);
  const sources = commandSchemas['sources list'].parse(
    (await cli(['sources', 'list'])).result,
  ).sources;
  expect(sources.map((source) => source.id)).toEqual(template.sources.map((source) => source.id));
  expect(sources.length).toBeGreaterThan(0);
});
describe('CT-03 / CT-04: source commands', () => {
  let context: Awaited<ReturnType<typeof fixture>>;
  beforeEach(async () => {
    context = await fixture();
    const { dir, cli } = context;
    for (const id of ['alpha', 'beta']) {
      await writeFile(
        join(dir, `${id}.md`),
        `# ${id}\n\nA partial index contains only rows satisfying its predicate. It reduces index size when most rows are excluded.\n`,
      );
      const added = commandSchemas.add.parse(
        (await cli(['add', join(dir, `${id}.md`), '--id', id])).result,
      );
      expect(added.source.id).toBe(id);
    }
    await cli(['ingest', '--offline']);
  });
  test('CT-06 / FR-82 / D-125: inspect success, source filter, persisted result and failures', async () => {
    const { cli, dir, config } = context;
    const all = commandSchemas.inspect.parse((await cli(['inspect'])).result);
    expect(all.sources.map((s) => s.id)).toEqual(['alpha', 'beta']);
    expect(all.sources.every((s) => s.documents === 1 && s.chunks > 0)).toBe(true);
    expect(all.corpus).toBe(config.corpus.name);
    expect(JSON.parse(await readFile(join(dir, all.path), 'utf8'))).toEqual(all);
    const selected = commandSchemas.inspect.parse(
      (await cli(['inspect', '--source', 'alpha'])).result,
    );
    expect(selected.sources.map((s) => s.id)).toEqual(['alpha']);
    expect(selected.findings.filter((f) => f.code === 'boilerplate_removed')).toMatchObject([
      { sourceId: 'alpha', count: 0 },
    ]);
    expect((await cli(['inspect', '--source', 'missing'], 1)).error?.code).toBe(
      'VALIDATION_FAILED',
    );
    expect((await cli(['inspect', '--invalid'], 1)).error?.code).toBe('VALIDATION_FAILED');
    expect((await cli(['inspect'], 2, { DATABASE_URL: '' })).error?.code).toBe(
      'NEEDS_CONFIRMATION',
    );
    await cli(['inspect'], 1, { DATABASE_URL: 'postgres://test:test@127.0.0.1:1/test' });
    await rm(join(dir, 'corpus'), { recursive: true, force: true });
    await writeFile(join(dir, 'corpus'), 'blocks report directory');
    expect((await cli(['inspect'], 1)).error?.code).toBe('VALIDATION_FAILED');
  });
  test('CT-03 add rejects duplicate ids; CT-04 sources list returns both sources', async () => {
    const { dir, cli } = context;
    await cli(['add', join(dir, 'alpha.md'), '--id', 'alpha'], 1);
    expect(
      commandSchemas['sources list']
        .parse((await cli(['sources', 'list'])).result)
        .sources.map((source) => source.id),
    ).toEqual(['alpha', 'beta']);
  });
  test('CT-01 / CT-13: diagnostics describe real host checks for an ingested corpus', async () => {
    const { cli } = context;
    const diagnostics = await cli(['doctor'], [0, 2]);
    const hostChecks = commandSchemas.doctor.parse(diagnostics.result).checks;
    // A different local Docker project may own 3000. Its presence is a real doctor
    // failure, not permission to stop that unrelated service during tests.
    expect(hostChecks.filter((c) => c.id !== 'ports').every((c) => c.ok)).toBe(true);
    expect(diagnostics.ok).toBe(hostChecks.every((c) => c.ok));
    await cli(['deploy:check', '--profile', 'local']);
  });
  test('CT-04 / IT-18: only selected source documents and chunks removed; last source removable', async () => {
    const { cli } = context;
    const before = await getSql()<
      { id: string; source_id: string }[]
    >`SELECT id::text, source_id FROM documents ORDER BY source_id`;
    expect(before).toHaveLength(2);
    expect((await cli(['sources', 'remove', 'alpha'], 2)).error?.code).toBe('NEEDS_CONFIRMATION');
    expect(
      commandSchemas['sources remove'].parse(
        (await cli(['sources', 'remove', 'alpha', '--yes'])).result,
      ).removedDocuments,
    ).toBe(1);
    const after = await getSql()<
      { id: string; source_id: string }[]
    >`SELECT id::text, source_id FROM documents ORDER BY source_id`;
    expect(after).toEqual(before.filter((d) => d.source_id === 'beta'));
    const chunks = await getSql()<
      { source_id: string }[]
    >`SELECT d.source_id FROM chunks c JOIN documents d ON d.id=c.document_id`;
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every((c) => c.source_id === 'beta')).toBe(true);
    await cli(['sources', 'remove', 'missing', '--yes'], 1);
    await cli(['sources', 'remove', 'beta', '--yes']);
    expect(
      commandSchemas['sources list'].parse((await cli(['sources', 'list'])).result).sources,
    ).toEqual([]);
    expect((await cli(['ask', 'What is an index?'], 2)).error?.message).toBe(
      'No sources configured. Next: sourced add <url or path>',
    );
  });
});
describe('CT-07 ask / FR-80', () => {
  let context: Awaited<ReturnType<typeof fixture>>;
  const question = 'When should I use a partial index?';
  beforeEach(async () => {
    context = await fixture();
    const { dir, config, cli } = context;
    await writeFile(
      join(dir, 'guide.md'),
      '# Partial indexes\n\nA partial index is an index built over a subset of a table; the subset is defined by a conditional expression called the predicate of the partial index. The index contains entries only for those table rows that satisfy the predicate.\n',
    );
    const added = commandSchemas.add.parse(
      (await cli(['add', join(dir, 'guide.md'), '--id', 'guide'])).result,
    );
    config.sources = [added.source];
    setCliKitConfig(config);
    await cli(['ingest', '--offline']);
  });
  test('CT-07 / FR-08: real CLI matches API events and query_log source cli', async () => {
    const { cli } = context;
    const result = commandSchemas.ask.parse((await cli(['ask', question, '--trace'])).result);
    const response = await POST(
      new Request('http://localhost:3000/api/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question }),
      }),
    );
    const events: SseEvent[] = [];
    const parser = createSseParser((e) =>
      events.push(SseEvent.parse({ event: e.event, data: JSON.parse(e.data) as unknown })),
    );
    parser.push(await response.text());
    parser.end();
    for (const callback of callbacks.splice(0)) await callback();
    const meta = events.find((e) => e.event === 'meta');
    const citations = events.find((e) => e.event === 'citations');
    const done = events.find((e) => e.event === 'done');
    expect(meta?.event).toBe('meta');
    expect(citations?.event).toBe('citations');
    expect(done?.event).toBe('done');
    if (meta?.event !== 'meta' || citations?.event !== 'citations' || done?.event !== 'done')
      throw new Error('Missing events');
    expect(result.answer).toBe(citations.data.answer);
    expect(result.citations).toEqual(citations.data.valid);
    expect(result.trace?.passages).toEqual(meta.data.passages);
    expect(result.trace?.retrieval).toMatchObject({
      ...meta.data.retrieval,
      timingsMs: {
        embed: expect.any(Number) as unknown,
        search: expect.any(Number) as unknown,
        rerank: expect.any(Number) as unknown,
      },
    });
    expect(result.trace?.usage).toEqual(done.data.usage);
    expect(result.trace?.costUsdEstimate).toBe(done.data.costUsdEstimate);
    expect(result.trace?.invalid).toEqual(citations.data.invalid);
    expect(result.trace?.latencyMs).toMatchObject({
      total: expect.any(Number) as unknown,
      generation: expect.any(Number) as unknown,
    });
    expect(
      await getSql()<{ source: string }[]>`SELECT source FROM query_log WHERE source='cli'`,
    ).toHaveLength(1);
  });
  test('CT-07: optional trace, not-found and rejected citations preserve result schemas', async () => {
    const { cli } = context;
    const untraced = commandSchemas.ask.parse((await cli(['ask', question])).result);
    expect(untraced.trace).toBeUndefined();
    const notFound = commandSchemas.ask.parse(
      (await cli(['ask', 'mock:not-found partial index', '--trace'])).result,
    );
    expect(notFound.outcome).toBe('not_found');
    expect(notFound.answer).toBe('');
    const invalid = commandSchemas.ask.parse(
      (await cli(['ask', 'mock:invalid-citation partial index', '--trace'])).result,
    );
    expect(invalid.trace?.invalid).toEqual(
      expect.arrayContaining([expect.objectContaining({ reason: 'UNKNOWN_PASSAGE' })]),
    );
  });
  test('CT-07: validation, environment, missing key, provider and corpus mismatch exit codes', async () => {
    const { cli, dir, config } = context;
    await cli(['ask', 'x'], 1);
    await cli(['ask', question], 2, { DATABASE_URL: '' });
    const missingKey = await cli(['ask', question], 2, { LLM_MODE: 'live', OPENAI_API_KEY: '' });
    expect(missingKey.error?.code).toBe('CONFIG_INVALID');
    expect(missingKey.error?.message).toContain('OPENAI_API_KEY');
    expect((await cli(['ask', 'mock:provider-error partial index'], 1)).error?.code).toBe(
      'PROVIDER_ERROR',
    );
    config.models.embed.dimensions = 768;
    await writeFile(join(dir, 'sourced.config.ts'), `export default ${JSON.stringify(config)};\n`);
    expect((await cli(['ask', question], 2)).error?.code).toBe('CORPUS_MISMATCH');
  });
});
test('CT-01 doctor / CT-13 deploy: FR-78/81 failed checks carry fixes and mock diagnostics never call live providers', async () => {
  const { cli } = await fixture();
  const doctorEnvelope = await cli(['doctor', '--no-network'], 2);
  const doctor = commandSchemas.doctor.parse(doctorEnvelope.result);
  expect(doctor.checks.find((c) => c.id === 'dimensions')?.detail).toContain('Skipped');
  for (const check of doctor.checks.filter((c) => !c.ok)) expect(check.fix).toBeTruthy();
  const deployEnvelope = await cli(['deploy:check', '--profile', 'private'], 2, {
    SOURCED_ACCESS_TOKEN: '',
  });
  const deploy = commandSchemas['deploy:check'].parse(deployEnvelope.result);
  for (const [envelope, result] of [
    [doctorEnvelope, doctor],
    [deployEnvelope, deploy],
  ] as const) {
    expect(envelope.error?.code).toBe('CHECKS_FAILED');
    expect(envelope.error?.message).toBe(
      result.checks
        .filter((check) => !check.ok)
        .map((check) => `${check.id}: ${z.string().min(1).parse(check.fix)}`)
        .join('\n'),
    );
  }
  expect(deploy.checks.find((c) => c.id === 'access-token')?.ok).toBe(false);
  await cli(['doctor', '--invalid'], 1);
});
test('CT-11 dev / FR-64: local snapshot; one ready envelope; shutdown forwards to app', async () => {
  const { dir, env, cli } = await fixture();
  expect((await cli(['dev', '--port', '0'], 1)).error?.code).toBe('VALIDATION_FAILED');
  expect((await cli(['dev'], 2, { DATABASE_URL: '' })).error?.code).toBe('CONFIG_INVALID');
  await mkdir(join(dir, 'app'));
  await symlink(join(root, 'node_modules'), join(dir, 'node_modules'), 'dir');
  await writeFile(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'cli-dev-fixture', private: true, type: 'module' }),
  );
  await writeFile(
    join(dir, 'app/layout.js'),
    'export default function Layout({children}) { return <html><body>{children}</body></html>; }',
  );
  await writeFile(
    join(dir, 'app/page.js'),
    'export default function Page() { return <main>Fixture</main>; }',
  );
  const child = spawn(process.execPath, [...args, 'dev', '--port', '3198', '--json'], {
    cwd: dir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  try {
    const envelope = await new Promise<z.infer<typeof CliEnvelope>>((resolveReady, reject) => {
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
        if (stdout.includes('\n')) {
          try {
            resolveReady(CliEnvelope.parse(JSON.parse(stdout)));
          } catch (error) {
            reject(error instanceof Error ? error : new Error('Invalid CLI envelope'));
          }
        }
      });
      child.once('error', reject);
      child.once('exit', () => {
        reject(new Error(`dev exited: ${stderr}`));
      });
    });
    expect(envelope.ok, JSON.stringify(envelope)).toBe(true);
    expect(commandSchemas.dev.parse(envelope.result).url).toBe('http://localhost:3198');
    expect(JSON.parse(await readFile(join(dir, '.sourced/config.json'), 'utf8'))).toHaveProperty(
      'config.profile',
      'local',
    );
  } finally {
    const exited = new Promise<void>((resolveExit) =>
      child.once('exit', () => {
        resolveExit();
      }),
    );
    child.kill('SIGINT');
    await exited;
  }
  expect(child.exitCode).toBe(130);
  expect(stdout.trim().split('\n')).toHaveLength(1);
});

for (const [id, command] of [
  ['CT-08', 'eval:generate'],
  ['CT-09', 'eval:review'],
] as const) {
  test(`${id} / D-122: ${command} reserves its schema and exits 1 until its implementation task`, async () => {
    const { cli } = await fixture();
    const result = await cli([command], 1);
    expect(result.result).toBeUndefined();
    expect(result.error?.code).toBe('INTERNAL_ERROR');
    expect(result.error?.message).toBe(
      `${command} is not implemented yet. This command is reserved for a later implementation task.`,
    );
  });
}
test('CT-12 / D-122: Node down directs the caller to the Docker launcher', async () => {
  const { cli } = await fixture();
  const result = await cli(['down'], 1);
  expect(result.error?.code).toBe('INTERNAL_ERROR');
  expect(result.error?.message).toBe('Use ./sourced down to stop containers on the Docker path.');
});
test('CT-14 / NFR-22: config:snapshot writes the reported hash and rejects invalid configuration', async () => {
  const { cli, dir } = await fixture();
  const result = commandSchemas['config:snapshot'].parse((await cli(['config:snapshot'])).result);
  const snapshot = JSON.parse(await readFile(join(dir, '.sourced/config.json'), 'utf8')) as {
    configHash: string;
  };
  expect(snapshot.configHash).toBe(result.configHash);
  expect((await cli(['config:snapshot'])).result).toEqual(result);
  await writeFile(join(dir, 'sourced.config.ts'), 'export default {schemaVersion: 999};');
  expect((await cli(['config:snapshot'], 1)).error?.code).toBe('CONFIG_INVALID');
});
test('CT-05 / FR-77: rebuild needs confirmation and missing provider key exits 2', async () => {
  const { cli, dir } = await fixture();
  expect((await cli(['ingest', '--rebuild'], 2)).error?.code).toBe('NEEDS_CONFIRMATION');
  await writeFile(
    join(dir, 'guide.md'),
    '# Transactions\n\nA transaction groups database changes into one atomic operation. Commit saves all changes. Rollback discards them.\n',
  );
  await cli(['add', join(dir, 'guide.md')]);
  const missing = await cli(['ingest', '--offline'], 2, { LLM_MODE: 'live', OPENAI_API_KEY: '' });
  expect(missing.error?.code).toBe('CONFIG_INVALID');
  expect(missing.error?.message).toContain('OPENAI_API_KEY');
  await cli(['ingest', '--offline', '--rebuild', '--yes']);
});

describe('CT-01 / CT-13: successful diagnostics', () => {
  let context: Awaited<ReturnType<typeof fixture>>;
  beforeEach(async () => {
    context = await fixture();
    const { cli, dir } = context;
    await writeFile(
      join(dir, 'guide.md'),
      '# Indexes\n\nA partial index contains only rows satisfying its predicate. It reduces index size when most rows are excluded.\n',
    );
    await cli(['add', join(dir, 'guide.md')]);
    await cli(['ingest', '--offline']);
  });
  test('CT-01 / FR-78: every doctor check passes with controlled host port ownership', async () => {
    const { cli, dir, env } = context;
    // The real CLI talks to the integration DB. Only the host Docker port probe
    // is a fixture: CI service ports need not belong to this compose project.
    const bin = join(dir, 'bin');
    await mkdir(bin);
    const dbPort = new URL(env.DATABASE_URL).port || '5432';
    await writeFile(
      join(bin, 'docker'),
      `#!/bin/sh\ncase "$*" in\n  "compose port db 5432") echo '127.0.0.1:${dbPort}' ;;\n  "compose port app 3000") echo '127.0.0.1:3000' ;;\n  *) exit 1 ;;\nesac\n`,
      { mode: 0o755 },
    );
    const result = await cli(['doctor'], 0, { PATH: `${bin}:${env.PATH ?? ''}` });
    const checks = commandSchemas.doctor.parse(result.result).checks;
    expect(checks.map((c) => c.id)).toEqual([
      'config',
      'node',
      'ports',
      'disk',
      'database',
      'fts',
      'corpus',
      'keys',
      'dimensions',
      'writable',
    ]);
    expect(checks.every((c) => c.ok)).toBe(true);
  });
  test('CT-13 / FR-81: deploy:check succeeds for an ingested local corpus', async () => {
    const { cli } = context;
    const result = commandSchemas['deploy:check'].parse(
      (await cli(['deploy:check', '--profile', 'local'])).result,
    );
    expect(result.checks.every((c) => c.ok)).toBe(true);
  });
});
test('CT-05 / FR-77: robots refusal is exit 2 without fetching the disallowed page', async () => {
  const { cli } = await fixture();
  const paths: string[] = [];
  const server = createServer((request, response) => {
    paths.push(request.url ?? '');
    response.end('User-agent: *\nDisallow: /\n');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No server address');
    await cli([
      'add',
      `http://127.0.0.1:${String(address.port)}/guide.html`,
      '--type',
      'urls',
      '--id',
      'robots',
    ]);
    const result = await cli(['ingest'], 2);
    expect(result.error?.code).toBe('VALIDATION_FAILED');
    expect(result.error?.message).toContain('robots');
    expect(paths).toEqual(['/robots.txt']);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      }),
    );
  }
});

test('CT-05 / CT-07 / D-114: no configured sources need user action', async () => {
  const { cli } = await fixture();
  expect((await cli(['ask', 'What is a transaction?'], 2)).error?.code).toBe('CORPUS_EMPTY');
  expect((await cli(['ingest', '--offline'], 2)).error?.code).toBe('CORPUS_EMPTY');
});

test('CT-07: configured sources with no indexed chunks exit 2 with CORPUS_EMPTY', async () => {
  const { cli, dir, config } = await fixture();
  config.sources = [
    SourceSchema.parse({ id: 'guide', type: 'folder', path: join(dir, 'guide.md') }),
  ];
  await writeFile(join(dir, 'sourced.config.ts'), `export default ${JSON.stringify(config)};\n`);
  // No .sourced snapshot: a valid TS config must bootstrap ask before prompt imports.
  expect((await cli(['ask', 'When should I use a partial index?'], 2)).error?.code).toBe(
    'CORPUS_EMPTY',
  );
});

test('CT-06: inspect handles no sources, un-ingested sources and invalid configuration', async () => {
  const { cli, dir } = await fixture();
  expect((await cli(['inspect'], 2)).error?.code).toBe('CORPUS_EMPTY');
  await writeFile(join(dir, 'guide.txt'), 'A guide.');
  await cli(['add', join(dir, 'guide.txt'), '--id', 'guide']);
  // Clear previous runs too: an all-skipped run must remain inspectable.
  await getSql()`TRUNCATE ingest_runs CASCADE`;
  expect((await cli(['inspect'], 2)).error?.code).toBe('CORPUS_EMPTY');
  await writeFile(join(dir, 'sourced.config.ts'), 'export default {schemaVersion: 999};');
  expect((await cli(['inspect'], 1)).error?.code).toBe('CONFIG_INVALID');
});
