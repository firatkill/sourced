// CT drafts (T-63 finalizes numbering): real process, integration DB, mock providers.
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeEach, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { CliEnvelope } from '@/lib/cli/envelope';
import { commandSchemas } from '@/lib/cli/schemas/commands';
import { parseInvocation } from '@/lib/cli/router';
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
  resolve('node_modules/tsx/dist/cli.mjs'),
  '--tsconfig',
  resolve('tsconfig.json'),
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
  const config = structuredClone(template);
  config.profile = 'local';
  config.sources = [];
  await writeFile(join(dir, 'sourced.config.ts'), `export default ${JSON.stringify(config)};\n`);
  const url = requireLocalDatabase(process.env.TEST_DATABASE_URL);
  const env = {
    ...process.env,
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
    if (envelope.result !== undefined)
      commandSchemas[parseInvocation(command).command].parse(envelope.result);
    if (!envelope.ok) expect(envelope.error?.fix).toBeTruthy();
    for (const line of output.stderr.trim().split('\n').filter(Boolean))
      expect(JSON.parse(line)).toHaveProperty('event');
    return envelope;
  };
  return { dir, config, cli, env };
}
test('CT draft init / FR-79, D-113–114: flags-only, dimensions, token preservation, overwrite refusal', async () => {
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
  await cli(['ask', 'What is a transaction?'], 2);
  await cli(['ingest', '--offline'], 2);
});
test('CT draft init / D-117: example sources survive initialization and replacement requires --yes', async () => {
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
test('CT draft add/sources / IT-18: only selected source documents and chunks removed; last source removable', async () => {
  const { dir, cli } = await fixture();
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
  await cli(['add', join(dir, 'alpha.md'), '--id', 'alpha'], 1);
  await cli(['ingest', '--offline']);
  const diagnostics = await cli(['doctor'], [0, 2]);
  const hostChecks = commandSchemas.doctor.parse(diagnostics.result).checks;
  // A different local Docker project may own 3000. Its presence is a real doctor
  // failure, not permission to stop that unrelated service during tests.
  expect(hostChecks.filter((c) => c.id !== 'ports').every((c) => c.ok)).toBe(true);
  expect(diagnostics.ok).toBe(hostChecks.every((c) => c.ok));
  await cli(['deploy:check', '--profile', 'local']);
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
test('CT draft ask / FR-80, FR-08: real CLI matches API events and query_log source cli', async () => {
  const { dir, config, cli } = await fixture();
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
  const question = 'When should I use a partial index?';
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
  const untraced = commandSchemas.ask.parse((await cli(['ask', question])).result);
  expect(untraced.trace).toBeUndefined();
  await cli(['ask', 'x'], 1);
  await cli(['ask', question], 2, { DATABASE_URL: '' });
  await cli(['ask', question], 2, { LLM_MODE: 'live', OPENAI_API_KEY: '' });
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
  expect((await cli(['ask', 'mock:provider-error partial index'], 1)).error?.code).toBe(
    'PROVIDER_ERROR',
  );
  config.models.embed.dimensions = 768;
  await writeFile(join(dir, 'sourced.config.ts'), `export default ${JSON.stringify(config)};\n`);
  expect((await cli(['ask', question], 2)).error?.code).toBe('CORPUS_MISMATCH');
});
test('CT draft doctor/deploy: FR-78/81 failed checks carry fixes and mock diagnostics never call live providers', async () => {
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
test('CT draft dev / FR-64: local snapshot; one ready envelope; shutdown forwards to app', async () => {
  const { dir, env } = await fixture();
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
