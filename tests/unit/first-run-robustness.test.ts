// D-136 / D-137: first-run robustness (owner report, 2026-11-19).
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import mongo from '../../examples/mongodb/sourced.config';
import { loadConfig, parseKitConfig } from '@/lib/kit/load-config';
import { forLauncher, resetKitConfigForTests, sourcedCommand } from '@/lib/kit/runtime-config';
import { corpusRebuildRequired, corpusSchema, mismatchMessage } from '@/lib/kit/vector-schema';
import { ensureComposeProject } from '@/lib/kit/compose-project';
import { planIngest } from '@/lib/cli/commands/ingest-report';
import { runIngest } from '@/lib/cli/commands/ingest';
import { parseInvocation, errorEnvelope } from '@/lib/cli/router';
import { emptyCounters } from '@/lib/cli/schemas/ingest';
import { resetEnvForTests } from '@/lib/env';
import { AppError } from '@/lib/errors';

vi.mock('@/lib/kit/load-config', async (original) => ({
  ...(await original<typeof import('@/lib/kit/load-config')>()),
  loadConfig: vi.fn(),
}));
vi.mock('postgres', () => ({ default: Object.assign(() => ({ end: vi.fn() }), { BigInt: {} }) }));
vi.mock('@/lib/kit/vector-schema', async (original) => ({
  ...(await original<typeof import('@/lib/kit/vector-schema')>()),
  corpusRebuildRequired: vi.fn(),
  ensureCorpusSchema: vi.fn(() => Promise.reject(new Error('stop after confirmation'))),
}));
vi.mock('@/lib/ingest/load', () => ({
  assertIngestAllowed: vi.fn(),
  loadCorpus: vi.fn(() => Promise.resolve({})),
}));
vi.mock('@/lib/cli/commands/ingest-report', () => ({
  planIngest: vi.fn(() =>
    Promise.resolve([
      { ...emptyCounters(), id: 'docs', type: 'folder', gitRevision: null, skipped: [] },
    ]),
  ),
}));

const stored = {
  embed_provider: 'mock',
  embed_model: 'mock-feature-hash',
  embed_dimensions: 1536,
  vector_type: 'vector' as const,
  fts_config: 'english',
  retrieval_hash: 'stored',
};
const directories: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  resetEnvForTests();
  resetKitConfigForTests();
  vi.mocked(planIngest).mockClear();
  for (const dir of directories.splice(0)) await rm(dir, { recursive: true, force: true });
});

test('D-137: sourcedCommand follows the launcher, then the Docker marker, then pnpm', () => {
  vi.stubEnv('SOURCED_LAUNCHER', 'sourced.cmd');
  vi.stubEnv('SOURCED_DOCKER', '1');
  expect(sourcedCommand()).toBe('sourced.cmd');
  vi.stubEnv('SOURCED_LAUNCHER', '');
  expect(sourcedCommand()).toBe('./sourced');
  vi.stubEnv('SOURCED_DOCKER', '');
  expect(sourcedCommand()).toBe('pnpm sourced');
  expect(forLauncher('Next: pnpm sourced ingest --rebuild')).toBe(
    'Next: pnpm sourced ingest --rebuild',
  );
  vi.stubEnv('SOURCED_LAUNCHER', './sourced');
  expect(forLauncher('Run pnpm sourced ingest, then pnpm sourced dev.')).toBe(
    'Run ./sourced ingest, then ./sourced dev.',
  );
});

test('D-137: a mismatch is explained in plain words, naming the bundled mock example', () => {
  const configured = corpusSchema(parseKitConfig(mongo));
  const message = mismatchMessage(stored, { ...configured, embed_provider: 'openai' });
  expect(message).toContain('built with mock:mock-feature-hash (1536 dimensions, english)');
  expect(message).toContain('Your configuration uses openai:');
  expect(message).toContain('holds the bundled mock example, not your documents');
  expect(message).toContain('--rebuild');
  expect(message).not.toContain('{');
  expect(mismatchMessage(stored, { ...configured, embed_provider: 'mock' })).not.toContain(
    'bundled mock example',
  );
  const { envelope } = errorEnvelope('ingest', new AppError('CORPUS_MISMATCH', message));
  expect(envelope.error).toMatchObject({ message, fix: 'pnpm sourced ingest --rebuild' });
});

test('D-137: an incompatible index with chunks needs a rebuild; an empty one does not', async () => {
  const { corpusRebuildRequired: real } =
    await vi.importActual<typeof import('@/lib/kit/vector-schema')>('@/lib/kit/vector-schema');
  const config = parseKitConfig(mongo);
  const fake = (chunks: boolean) =>
    vi.fn((strings: TemplateStringsArray) =>
      Promise.resolve(
        strings.join('').includes('FROM corpus_meta') ? [stored] : [{ present: chunks }],
      ),
    ) as unknown as Parameters<typeof corpusRebuildRequired>[0];
  await expect(real(fake(true), config)).resolves.toMatchObject({
    required: true,
    message: expect.stringContaining('built with mock:mock-feature-hash') as unknown,
  });
  await expect(real(fake(false), config)).resolves.toEqual({ required: false });
});

function ingestWith(required: boolean) {
  vi.stubEnv('LLM_MODE', 'mock');
  resetEnvForTests();
  vi.mocked(loadConfig).mockResolvedValue(parseKitConfig(mongo));
  vi.mocked(corpusRebuildRequired).mockResolvedValue(
    required
      ? { required: true, message: 'The existing index was built with mock.' }
      : { required: false },
  );
}

test('D-137: the dry run reports the mismatch as a warning and estimates a full rebuild', async () => {
  ingestWith(true);
  const result = await runIngest(parseInvocation(['ingest', '--dry-run']), {
    isTTY: false,
    progress: vi.fn(),
  });
  expect(result.warnings).toEqual([
    { code: 'CORPUS_MISMATCH', message: 'The existing index was built with mock.' },
  ]);
  expect(vi.mocked(planIngest).mock.calls[0]?.[5]).toBe(true);
  ingestWith(false);
  const clean = await runIngest(parseInvocation(['ingest', '--dry-run']), {
    isTTY: false,
    progress: vi.fn(),
  });
  expect(clean.warnings).toEqual([]);
  expect(vi.mocked(planIngest).mock.calls[1]?.[5]).toBe(false);
});

test('D-137: ingest asks before rebuilding in a terminal and refuses without one', async () => {
  ingestWith(true);
  const no = vi.fn(() => Promise.resolve(false));
  await expect(
    runIngest(parseInvocation(['ingest']), { isTTY: true, progress: vi.fn(), prompt: no }),
  ).rejects.toMatchObject({ code: 'CORPUS_MISMATCH' });
  expect(no).toHaveBeenCalledWith(expect.stringContaining('Rebuild the index now?'));
  // --yes approves cost only; it never deletes the index on its own.
  await expect(
    runIngest(parseInvocation(['ingest', '--yes', '--json']), { isTTY: false, progress: vi.fn() }),
  ).rejects.toMatchObject({ code: 'CORPUS_MISMATCH' });
  const yes = vi.fn(() => Promise.resolve(true));
  const { ensureCorpusSchema } = await import('@/lib/kit/vector-schema');
  await expect(
    runIngest(parseInvocation(['ingest']), { isTTY: true, progress: vi.fn(), prompt: yes }),
  ).rejects.toThrow('stop after confirmation');
  expect(vi.mocked(ensureCorpusSchema)).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.anything(),
    {
      rebuild: true,
      confirmed: true,
    },
  );
});

test('D-136: the Node CLI records one project per checkout and keeps a legacy one', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'sourced-project-'));
  directories.push(root);
  const none = vi.fn(() => Promise.resolve({ stdout: '' }));
  const fresh = await ensureComposeProject(root, none, {});
  expect(fresh).toMatch(/^sourced-[0-9a-f]{8}$/);
  expect(await readFile(path.join(root, '.env'), 'utf8')).toBe(
    `COMPOSE_PROJECT_NAME=${fresh ?? ''}\n`,
  );
  expect(await ensureComposeProject(root, none, {})).toBe(fresh);
  expect(none).toHaveBeenCalledTimes(1);

  const upgraded = await mkdtemp(path.join(tmpdir(), 'sourced-project-'));
  directories.push(upgraded);
  await writeFile(path.join(upgraded, '.env'), 'OTHER=1');
  const listing = `/elsewhere|sourced\n${(await realpath(upgraded)).toUpperCase()}/|legacy\n`;
  expect(await ensureComposeProject(upgraded, () => Promise.resolve({ stdout: listing }), {})).toBe(
    'legacy',
  );
  expect(await readFile(path.join(upgraded, '.env'), 'utf8')).toBe(
    'OTHER=1\nCOMPOSE_PROJECT_NAME=legacy\n',
  );

  const offline = await mkdtemp(path.join(tmpdir(), 'sourced-project-'));
  directories.push(offline);
  expect(
    await ensureComposeProject(offline, () => Promise.reject(new Error('no daemon')), {}),
  ).toBeUndefined();
  await expect(readFile(path.join(offline, '.env'))).rejects.toMatchObject({ code: 'ENOENT' });
  expect(await ensureComposeProject(offline, none, { COMPOSE_PROJECT_NAME: 'mine' })).toBe('mine');
});

test('D-137: app startup writes the failure for dev and prints one startup.failed line', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'sourced-startup-'));
  directories.push(root);
  vi.stubEnv('SOURCED_LAUNCHER', './sourced');
  resetEnvForTests();
  vi.mocked(loadConfig).mockResolvedValue(parseKitConfig(mongo));
  const database = await import('@/lib/cli/commands/database');
  const init = vi
    .spyOn(database, 'initializeDatabase')
    .mockRejectedValue(new AppError('CORPUS_MISMATCH', 'The existing index was built with mock.'));
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  const { startApp } = await import('../../scripts/app-startup');
  expect(await startApp(root)).toBe(false);
  const failure = {
    code: 'CORPUS_MISMATCH',
    message: 'The existing index was built with mock.',
    fix: './sourced ingest --rebuild',
  };
  expect(
    JSON.parse(await readFile(path.join(root, '.sourced/startup-error.json'), 'utf8')),
  ).toEqual({ schemaVersion: 1, command: 'dev', ok: false, error: failure, warnings: [] });
  expect(await readFile(path.join(root, '.sourced/startup-error.txt'), 'utf8')).toBe(
    'The app did not start: The existing index was built with mock.\nNext: ./sourced ingest --rebuild\n',
  );
  expect(stderr).toHaveBeenCalledWith(
    `${JSON.stringify({ event: 'startup.failed', ...failure })}\n`,
  );
  init.mockResolvedValue('running');
  expect(await startApp(root)).toBe(true);
  await expect(readFile(path.join(root, '.sourced/startup-error.json'))).rejects.toMatchObject({
    code: 'ENOENT',
  });
  stderr.mockRestore();
  init.mockRestore();
});

test('D-138: the local profile needs only the provider key', async () => {
  const { withLocalDefaults, LOCAL_QUESTION_HASH_SALT } = await import('@/lib/env');
  expect(withLocalDefaults({ OPENAI_API_KEY: 'k' }, 'local')).toEqual({
    OPENAI_API_KEY: 'k',
    QUESTION_HASH_SALT: LOCAL_QUESTION_HASH_SALT,
    NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
  });
  expect(withLocalDefaults({ SOURCED_PORT: '3200' }, 'local').NEXT_PUBLIC_SITE_URL).toBe(
    'http://localhost:3200',
  );
  expect(
    withLocalDefaults(
      { QUESTION_HASH_SALT: 'mine', NEXT_PUBLIC_SITE_URL: 'http://x.test' },
      'local',
    ),
  ).toMatchObject({ QUESTION_HASH_SALT: 'mine', NEXT_PUBLIC_SITE_URL: 'http://x.test' });
  expect(withLocalDefaults({}, 'public-demo')).toEqual({});
  expect(withLocalDefaults({}, 'private')).toEqual({});
  expect(LOCAL_QUESTION_HASH_SALT.length).toBeGreaterThanOrEqual(32);
});

test('D-137: ingest prints a short summary in a terminal and the next command', async () => {
  const { formatEnvelope } = await import('@/lib/cli/output');
  const totals = {
    ...emptyCounters(),
    documents: { discovered: 35, done: 35, skipped: 1, failed: 0 },
    chunks: { new: 201, changed: 0, unchanged: 0, deleted: 0 },
    embeddingTokens: 71033,
    estimatedCostUsd: 0.0014,
  };
  const envelope = (mode: 'run' | 'dry-run', warnings: { code: string; message: string }[] = []) =>
    formatEnvelope(
      {
        schemaVersion: 1,
        command: 'ingest',
        ok: true,
        result: { mode, runId: null, corpusVersion: null, sources: [], totals },
        warnings,
      },
      false,
    );
  expect(envelope('dry-run')).toBe(
    'Dry run: 35 documents, 201 passages to embed (71033 tokens), 0 unchanged, 0 to remove.\n' +
      'Estimated embedding cost: $0.0014. Nothing was sent to a provider.\n' +
      '1 skipped and 0 failed documents; pnpm sourced inspect explains why.\n' +
      'Next: pnpm sourced ingest\n',
  );
  expect(envelope('dry-run', [{ code: 'CORPUS_MISMATCH', message: 'Built with mock.' }])).toMatch(
    /^Warning: Built with mock\.\n[\s\S]*Next: pnpm sourced ingest --rebuild\n$/,
  );
  expect(envelope('run')).toMatch(/^Indexed 35 documents: 201 new[\s\S]*Next: pnpm sourced dev\n$/);
});
