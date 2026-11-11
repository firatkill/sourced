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
      'INTERNAL_ERROR',
    );
    expect((await run([], 2)).error?.code).toBe('NEEDS_CONFIRMATION');
    expect((await run(['--compare', 'baseline'], 2)).error?.code).toBe('NEEDS_CONFIRMATION');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('CT-10 / FR-84 / D-129: kit eval uses config without model env and preserves confirmation diagnostics', async () => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { mkdir, symlink } = await import('node:fs/promises');
  const { CliEnvelope } = await import('@/lib/cli/envelope');
  const { commandSchemas } = await import('@/lib/cli/schemas/commands');
  const { parseKitConfig } = await import('@/lib/kit/load-config');
  const mongo = (await import('../../../examples/mongodb/sourced.config')).default;
  const root = process.cwd();
  const dir = await mkdtemp(join(tmpdir(), 'sourced-eval-contract-kit-'));
  const config = parseKitConfig(mongo);
  config.corpus.name = 'test-kit';
  const run = async (args: string[]) => {
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
          '--no-write',
          '--subset',
          '--only',
          'shared-inj-01',
          ...args,
        ],
        {
          cwd: dir,
          env: {
            PATH: process.env.PATH,
            GIT_DIR: join(root, '.git'),
            GIT_WORK_TREE: root,
            TSX_TSCONFIG_PATH: join(root, 'tsconfig.json'),
            LLM_MODE: 'mock',
            NODE_ENV: 'test',
            DATABASE_URL: requireLocalDatabase(process.env.TEST_DATABASE_URL),
            QUESTION_HASH_SALT: 'test-only-question-salt-0000000000000000',
            IP_HASH_SALT: 'test-only-ip-salt-00000000000000000000000',
            NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
          },
        },
      );
      return CliEnvelope.parse(JSON.parse(result.stdout));
    } catch (error) {
      if (!(error instanceof Error && 'stdout' in error && typeof error.stdout === 'string'))
        throw error;
      return CliEnvelope.parse(JSON.parse(error.stdout));
    }
  };
  try {
    await symlink(join(root, 'node_modules'), join(dir, 'node_modules'), 'dir');
    await mkdir(join(dir, 'eval/test-kit'), { recursive: true });
    await writeFile(join(dir, 'eval/test-kit/golden.jsonl'), jsonl(subset));
    await writeFile(join(dir, 'eval/thresholds.json'), await readFile('eval/thresholds.json'));
    await writeFile(join(dir, 'sourced.config.ts'), `export default ${JSON.stringify(config)};`);
    const pricedEnvelope = await run([]);
    expect(pricedEnvelope.result, JSON.stringify(pricedEnvelope)).toBeDefined();
    const priced = commandSchemas.eval.unwrap().parse(pricedEnvelope.result);
    expect(priced.metrics.errors).toBe(0);
    expect(priced.config).toMatchObject({ chatModel: 'mock', judgeModel: 'mock' });
    expect(priced.metrics.cost.totalUsd).toBeTypeOf('number');
    config.pricing = {};
    await writeFile(join(dir, 'sourced.config.ts'), `export default ${JSON.stringify(config)};`);
    const refused = await run([]);
    expect(refused.error?.message).toBe(
      'Price unknown for openai:gpt-6-luna; add it to pricing in sourced.config.ts to get an estimate.',
    );
    const confirmed = commandSchemas.eval.unwrap().parse((await run(['--yes'])).result);
    expect(confirmed.metrics.errors).toBe(0);
    expect(confirmed.metrics.cost.totalUsd).toBeNull();
    expect(confirmed.metrics.cost.perQuestionUsd).toBeNull();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
