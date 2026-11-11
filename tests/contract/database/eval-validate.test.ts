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
