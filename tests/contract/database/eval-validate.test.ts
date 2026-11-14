import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { beforeAll, expect, test } from 'vitest';
import { getSql } from '@/lib/db/client';
import { EMBEDDING } from '@/lib/config';
import { sha256Hex } from '@/lib/hash';
import { chunkDocument } from '@/lib/ingest/chunk';
import { loadManifest } from '@/lib/ingest/manifest';
import { parseHtml } from '@/lib/ingest/parse-html';
import { ingestCorpus } from '@/lib/ingest/upsert';
import { mockProvider } from '@/lib/llm/mock';
import { GoldenEntry, parseGolden } from '@/lib/eval/golden';
import { requireLocalDatabase } from '../../helpers/local-database';

let subset: GoldenEntry[];
beforeAll(async () => {
  const manifest = await loadManifest();
  const pages = [
    ...['indexes-partial.html', 'transaction-iso.html', 'datatype-json.html'].map((slug) => ({
      slug,
      path: `tests/fixtures/html/${slug}`,
      isFixture: false,
    })),
    ...manifest.fixtures.map((page) => ({ ...page, isFixture: true })),
  ];
  const documents = await Promise.all(
    pages.map(async ({ slug, path, isFixture }) => {
      const raw = await readFile(path, 'utf8');
      const parsed = parseHtml(raw, {
        slug,
        section: 'test',
        html: {
          preset: 'postgres-docbook' as const,
          contentSelector: manifest.contentSelector,
          removeSelectors: manifest.removeSelectors,
        },
      });
      return {
        slug,
        url: new URL(slug, manifest.baseUrl).href,
        title: parsed.title,
        version: manifest.version,
        section: 'test',
        isFixture,
        contentHash: sha256Hex(raw),
        chunks: chunkDocument(parsed, slug),
      };
    }),
  );
  await ingestCorpus({
    sql: getSql(),
    loadDocuments: () => Promise.resolve(documents),
    provider: mockProvider,
    embeddingModel: EMBEDDING.MOCK_MODEL,
    includeFixtures: true,
    pricePerMillion: 0,
  });
  subset = parseGolden(await readFile('eval/postgres-17/golden.jsonl', 'utf8')).entries.filter(
    (e) => ['q002', 'q004'].includes(e.id),
  );
});

async function runCli(text: string) {
  const dir = await mkdtemp(join(tmpdir(), 'sourced-golden-'));
  try {
    const file = join(dir, 'golden.jsonl');
    await writeFile(file, text);
    const child = spawn(
      'pnpm',
      [
        'exec',
        'tsx',
        '--conditions=react-server',
        'scripts/eval-validate.ts',
        '--file',
        file,
        '--subset',
      ],
      {
        env: {
          ...process.env,
          LLM_MODE: 'mock',
          DATABASE_URL: requireLocalDatabase(process.env.TEST_DATABASE_URL),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let output = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      output += chunk;
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      output += chunk;
    });
    const code = await new Promise<number | null>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });
    return { code, output };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
const jsonl = (entries: GoldenEntry[]) => entries.map((e) => JSON.stringify(e)).join('\n') + '\n';

test('TC-115 / IT-11 / FR-40: CLI exits zero for a subset whose anchors exist in ingested fixtures', async () => {
  expect(subset).toHaveLength(2);
  const result = await runCli(jsonl(subset));
  expect(result.code).toBe(0);
  expect(result.output).toContain('Validated 2 golden entries.');
  expect(result.output).toContain('Type / answerable chapter | Actual | Required');
});

test('TC-115 / IT-11 / FR-40: CLI exits nonzero and lists every absent anchor', async () => {
  const changed = structuredClone(subset);
  changed[0]!.expected_anchors.push('indexes-partial.html#MISSING', 'absent.html#ALSO-MISSING');
  const result = await runCli(jsonl(changed));
  expect(result.code).toBe(1);
  expect(result.output).toContain('Missing anchor: indexes-partial.html#MISSING');
  expect(result.output).toContain('Missing anchor: absent.html#ALSO-MISSING');
  expect(result.output).not.toContain('Validated');
});

test('TC-114 / IT-11 / FR-40: CLI reports line numbers and fails for malformed input', async () => {
  const result = await runCli(jsonl(subset) + '{invalid}\n');
  expect(result.code).toBe(1);
  expect(result.output).toContain('Line 3: invalid JSON.');
});

test('TC-113 / IT-11 / FR-40: subset mode still enforces question length', async () => {
  const changed = structuredClone(subset);
  changed[0]!.question = 'Too short';
  const result = await runCli(jsonl(changed));
  expect(result.code).toBe(1);
  expect(result.output).toContain('6–25 words');
});

test('CT-10 / FR-77: eval validation succeeds and reports documented failure envelopes', async () => {
  const { CliEnvelope } = await import('@/lib/cli/envelope');
  const { commandSchemas } = await import('@/lib/cli/schemas/commands');
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { z } = await import('zod');
  const dir = await mkdtemp(join(tmpdir(), 'sourced-eval-contract-'));
  const file = join(dir, 'golden.jsonl');
  const run = async (args: string[], expected: number) => {
    let stdout: string;
    let stderr: string;
    let code = 0;
    try {
      ({ stdout, stderr } = await promisify(execFile)(
        process.execPath,
        [
          '--import',
          'tsx',
          '--conditions=react-server',
          'scripts/sourced.ts',
          'eval',
          ...args,
          '--json',
        ],
        {
          env: {
            PATH: process.env.PATH,
            LLM_MODE: 'mock',
            NODE_ENV: 'test',
            DATABASE_URL: requireLocalDatabase(process.env.TEST_DATABASE_URL),
            QUESTION_HASH_SALT: 'test-only-question-salt-0000000000000000',
            IP_HASH_SALT: 'test-only-ip-salt-00000000000000000000000',
            NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
          },
        },
      ));
    } catch (error) {
      ({ stdout, stderr, code } = z
        .object({ stdout: z.string(), stderr: z.string(), code: z.number() })
        .parse(error));
    }
    expect(code, stdout).toBe(expected);
    expect(stdout.trim().split('\n')).toHaveLength(1);
    const envelope = CliEnvelope.parse(JSON.parse(stdout));
    expect(envelope.command).toBe('eval');
    expect(envelope.ok).toBe(expected === 0);
    commandSchemas.eval.parse(envelope.result);
    for (const line of stderr.trim().split('\n').filter(Boolean))
      expect(JSON.parse(line)).toHaveProperty('event');
    return envelope;
  };
  try {
    await writeFile(file, jsonl(subset));
    expect((await run(['--validate-only', '--file', file, '--subset'], 0)).result).toBeUndefined();
    await writeFile(file, '{invalid}\n');
    expect((await run(['--validate-only', '--file', file, '--subset'], 1)).error?.code).toBe(
      'VALIDATION_FAILED',
    );
    expect((await run([], 2)).error?.code).toBe('NEEDS_CONFIRMATION');
    expect((await run(['--compare', 'baseline'], 2)).error?.code).toBe('NEEDS_CONFIRMATION');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

async function kitEvalFixture() {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { mkdir, symlink } = await import('node:fs/promises');
  const { CliEnvelope } = await import('@/lib/cli/envelope');
  const { parseKitConfig } = await import('@/lib/kit/load-config');
  const mongo = (await import('../../../examples/mongodb/sourced.config')).default;
  const root = process.cwd();
  const dir = await mkdtemp(join(tmpdir(), 'sourced-eval-contract-kit-'));
  const config = parseKitConfig(mongo);
  config.corpus.name = 'test-kit';
  config.sources = parseKitConfig({
    ...config,
    sources: [{ id: 'crawl', type: 'crawl', root: 'https://example.com/docs', maxPages: 30 }],
  }).sources;
  const golden = Array.from({ length: 37 }, (_, index) => ({
    ...subset[index % subset.length]!,
    id: `q${String(index + 1).padStart(3, '0')}`,
    origin: index < 34 ? 'generated' : 'handwritten',
    type: index < 34 ? 'answerable' : 'unanswerable',
    expected_anchors: index < 34 ? subset[index % subset.length]!.expected_anchors : [],
  }));
  const run = async (args: string[], path = process.env.PATH, repository = true) => {
    try {
      const result = await promisify(execFile)(
        process.execPath,
        [
          '--import',
          'tsx',
          '--conditions=react-server',
          join(root, 'scripts/sourced.ts'),
          'eval',
          '--json',
          ...(args.includes('--validate-only') ? [] : ['--no-write']),
          ...args,
        ],
        {
          cwd: dir,
          env: {
            PATH: path,
            ...(repository ? { GIT_DIR: join(root, '.git'), GIT_WORK_TREE: root } : {}),
            TSX_TSCONFIG_PATH: join(root, 'tsconfig.json'),
            LLM_MODE: 'mock',
            NODE_ENV: 'test',
            DATABASE_URL: requireLocalDatabase(process.env.TEST_DATABASE_URL),
            QUESTION_HASH_SALT: 'test-only-question-salt-0000000000000000',
            IP_HASH_SALT: 'test-only-ip-salt-00000000000000000000000',
            NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
            MOCK_STREAM_DELAY_MS: '0',
          },
        },
      );
      return {
        ...CliEnvelope.parse(JSON.parse(result.stdout)),
        exitCode: 0,
        progress: result.stderr,
      };
    } catch (error) {
      if (!(error instanceof Error && 'stdout' in error && typeof error.stdout === 'string'))
        throw error;
      if (!('code' in error)) throw error;
      if (!('stderr' in error) || typeof error.stderr !== 'string') throw error;
      return {
        ...CliEnvelope.parse(JSON.parse(error.stdout)),
        exitCode: error.code,
        progress: error.stderr,
      };
    }
  };
  try {
    await symlink(join(root, 'node_modules'), join(dir, 'node_modules'), 'dir');
    await mkdir(join(dir, 'eval/test-kit'), { recursive: true });
    await writeFile(
      join(dir, 'eval/test-kit/golden.jsonl'),
      golden.map((entry) => JSON.stringify(entry)).join('\n') + '\n',
    );
    await writeFile(join(dir, 'eval/thresholds.json'), await readFile('eval/thresholds.json'));
    await writeFile(join(dir, 'sourced.config.ts'), `export default ${JSON.stringify(config)};`);
    return { dir, config, golden, run };
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
}

test('CT-10 / FR-84 / D-129: kit eval prices configured models and names missing roles', async () => {
  const { dir, config, run } = await kitEvalFixture();
  const { commandSchemas } = await import('@/lib/cli/schemas/commands');
  try {
    const pricedEnvelope = await run([]);
    expect(pricedEnvelope.result, JSON.stringify(pricedEnvelope)).toBeDefined();
    expect(pricedEnvelope.exitCode).toBe(1);
    const priced = commandSchemas.eval.unwrap().parse(pricedEnvelope.result);
    expect(priced.metrics.errors).toBe(0);
    expect(priced.metrics.counts.total).toBe(41);
    expect(pricedEnvelope.error?.code).toBe('CHECKS_FAILED');
    for (const failure of priced.failures)
      expect(pricedEnvelope.error?.message).toContain(failure.metric);
    expect(priced.config).toMatchObject({ chatModel: 'mock', judgeModel: 'mock' });
    expect(priced.metrics.cost.totalUsd).toBeTypeOf('number');
    config.models.judge = { provider: 'openai', model: 'missing-judge' };
    await writeFile(join(dir, 'sourced.config.ts'), `export default ${JSON.stringify(config)};`);
    const missingJudge = await run([]);
    expect(missingJudge.exitCode).toBe(2);
    expect(missingJudge.error?.code).toBe('NEEDS_CONFIRMATION');
    expect(missingJudge.error?.message).toContain('judge');
    expect(missingJudge.error?.message).toContain('Price unknown for openai:missing-judge;');
    delete config.models.judge;
    config.pricing = {};
    await writeFile(join(dir, 'sourced.config.ts'), `export default ${JSON.stringify(config)};`);
    const refused = await run([]);
    expect(refused.error?.message).toBe(
      'chat: Price unknown for openai:gpt-6-luna; add it to pricing in sourced.config.ts to get an estimate.',
    );
    const confirmed = commandSchemas.eval.unwrap().parse((await run(['--yes'])).result);
    expect(confirmed.metrics.errors).toBe(0);
    expect(confirmed.metrics.cost.totalUsd).toBeNull();
    expect(confirmed.metrics.cost.perQuestionUsd).toBeNull();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('CT-10 / FR-84 / D-132: eval works without Git and outside a repository', async () => {
  const { dir, run } = await kitEvalFixture();
  const { commandSchemas } = await import('@/lib/cli/schemas/commands');
  const { mkdir } = await import('node:fs/promises');
  try {
    // D-132: both the slim runtime and a zip outside a repository can evaluate.
    await mkdir(join(dir, 'eval/test-kit/results'));
    await writeFile(
      join(dir, 'eval/test-kit/results/prior.json'),
      await readFile('tests/fixtures/eval-results/2026-11-01.json'),
    );
    for (const [path, repository] of [
      [dir, true],
      [process.env.PATH, false],
    ] as const) {
      const portable = await run(['--only', 'shared-inj-01'], path, repository);
      expect(portable.exitCode).toBe(1);
      expect(portable.error?.code).toBe('CHECKS_FAILED');
      const result = commandSchemas.eval.unwrap().parse(portable.result);
      expect(result.gitSha).toBe('none');
      expect(result.metrics.errors).toBe(0);
      expect(result.baseline?.file).toBe('eval/test-kit/results/prior.json');
      expect(
        portable.progress.split('Git not available; baseline taken from files on disk.'),
      ).toHaveLength(2);
    }
    const unexpected = await run(['--yes', '--compare', 'missing-baseline.json']);
    expect(unexpected.exitCode).toBe(1);
    expect(unexpected.error?.code).toBe('INTERNAL_ERROR');
    expect(unexpected.error?.message).toBe('Eval failed during baseline loading.');
    expect(unexpected.result).toBeUndefined();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('CT-10 / FR-89: kit validation reports shortfalls and unknown anchors', async () => {
  const { dir, config, golden, run } = await kitEvalFixture();
  try {
    config.pricing = {};
    await writeFile(join(dir, 'sourced.config.ts'), `export default ${JSON.stringify(config)};`);
    const short = golden.filter((entry) => entry.type === 'answerable' || entry.id === 'q035');
    await writeFile(
      join(dir, 'eval/test-kit/golden.jsonl'),
      short.map((entry) => JSON.stringify(entry)).join('\n') + '\n',
    );
    const undersized = await run(['--validate-only']);
    expect(undersized.exitCode).toBe(1);
    expect(undersized.error?.code).toBe('VALIDATION_FAILED');
    expect(undersized.error?.message).toContain('unanswerable: need at least 3.');
    expect(undersized.error?.fix).toContain('questions');
    golden[0]!.expected_anchors = ['crawl:missing#anchor'];
    await writeFile(
      join(dir, 'eval/test-kit/golden.jsonl'),
      golden.map((entry) => JSON.stringify(entry)).join('\n') + '\n',
    );
    const missingAnchor = await run(['--validate-only']);
    expect(missingAnchor.exitCode).toBe(1);
    expect(missingAnchor.error?.code).toBe('VALIDATION_FAILED');
    expect(missingAnchor.error?.message).toContain('Missing anchor: crawl:missing#anchor');
    expect(missingAnchor.error?.fix).toContain('anchor');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
