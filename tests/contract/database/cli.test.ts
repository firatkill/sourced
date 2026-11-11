import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { expect, test } from 'vitest';
import { getKitConfig } from '@/lib/kit/runtime-config';
import { CliEnvelope } from '@/lib/cli/envelope';
import { IngestResult } from '@/lib/cli/schemas/ingest';
import { requireLocalDatabase } from '../../helpers/local-database';
const execute = promisify(execFile);
async function timestamps(root: string): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
    const path = join(entry.parentPath, entry.name);
    if (entry.isFile()) result[path] = (await stat(path)).mtimeMs;
  }
  return result;
}
test('CT-05 / TC-202/TC-203, D-109: real CLI ingest, idempotency and dry-run contract in mock mode', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sourced-cli-integration-'));
  const url = requireLocalDatabase(process.env.TEST_DATABASE_URL);
  const config = getKitConfig(false);
  config.pricing[`${config.models.embed.provider}:${config.models.embed.model}`] = {
    inputPerMTok: 0.02,
    outputPerMTok: 0,
  };
  config.sources = [
    {
      id: 'docs',
      type: 'folder',
      path: join(directory, 'guide.md'),
      include: [],
      exclude: [],
      group: 'docs',
      commitRaw: false,
      html: { preset: 'generic', removeSelectors: [] },
    },
  ];
  const args = [
    '--import',
    resolve('node_modules/tsx/dist/loader.mjs'),
    '--conditions=react-server',
    resolve('scripts/sourced.ts'),
  ];
  const options = {
    cwd: directory,
    env: {
      ...process.env,
      TSX_TSCONFIG_PATH: resolve('tsconfig.json'),
      LLM_MODE: 'mock',
      DATABASE_URL: url,
      MIGRATION_DATABASE_URL: url,
    },
  };
  try {
    await writeFile(
      join(directory, 'guide.md'),
      '# Guide\n\nA transaction groups database changes into one atomic operation. Commit saves all changes. Rollback discards them.\n',
    );
    await writeFile(
      join(directory, 'sourced.config.ts'),
      `export default ${JSON.stringify(config)};\n`,
    );
    const initialDry = await execute(
      process.execPath,
      [...args, 'ingest', '--offline', '--dry-run', '--json'],
      options,
    );
    const initialEnvelope = CliEnvelope.parse(JSON.parse(initialDry.stdout));
    const initialPreview = IngestResult.parse(initialEnvelope.result);
    expect(initialPreview.totals.embeddingTokens).toBeGreaterThan(0);
    expect(initialPreview.totals.estimatedCostUsd).toBe(
      (initialPreview.totals.embeddingTokens * 0.02) / 1_000_000,
    );
    expect(initialEnvelope.warnings).toContainEqual({
      code: 'MOCK_MODE',
      message: 'Mock mode: no provider is called; embeddings and answers are stand-ins.',
    });
    const first = await execute(
      process.execPath,
      [...args, 'ingest', '--offline', '--json'],
      options,
    );
    const envelope = CliEnvelope.parse(JSON.parse(first.stdout));
    expect(envelope.ok).toBe(true);
    const run = IngestResult.parse(envelope.result);
    expect(run.mode).toBe('run');
    expect(run.totals.estimatedCostUsd).toBe(initialPreview.totals.estimatedCostUsd);
    expect(run.runId).toMatch(/^\d+$/);
    expect(run.totals.documents.done).toBe(1);
    expect(run.totals.chunks.new).toBeGreaterThan(0);
    for (const line of first.stderr.trim().split('\n').filter(Boolean))
      expect(JSON.parse(line)).toHaveProperty('event');
    const before = await timestamps(directory);
    const dry = await execute(
      process.execPath,
      [...args, 'ingest', '--offline', '--dry-run', '--json'],
      options,
    );
    const preview = IngestResult.parse(CliEnvelope.parse(JSON.parse(dry.stdout)).result);
    expect(preview).toMatchObject({
      mode: 'dry-run',
      runId: null,
      corpusVersion: null,
      totals: {
        chunks: { new: 0, changed: 0, unchanged: run.totals.chunks.new, deleted: 0 },
        embeddingTokens: 0,
      },
    });
    expect(await timestamps(directory)).toEqual(before);
    const second = await execute(process.execPath, [...args, 'ingest', '--offline'], options);
    expect(second.stdout).toContain('Sourced ingest');
    expect(second.stdout).toContain('0 inserted');
    expect(await readFile(join(directory, '.sourced/config.json'), 'utf8')).toContain('configHash');
    config.models.embed.dimensions = 768;
    await writeFile(
      join(directory, 'sourced.config.ts'),
      `export default ${JSON.stringify(config)};\n`,
    );
    let mismatch: { stdout: string; stderr: string; code: number } | undefined;
    try {
      await execute(process.execPath, [...args, 'ingest', '--offline', '--json'], options);
    } catch (error) {
      mismatch = z
        .object({ stdout: z.string(), stderr: z.string(), code: z.number() })
        .parse(error);
    }
    expect(mismatch?.code).toBe(2);
    expect(CliEnvelope.parse(JSON.parse(mismatch?.stdout ?? '')).error?.code).toBe(
      'CORPUS_MISMATCH',
    );
    for (const line of mismatch?.stderr.trim().split('\n').filter(Boolean) ?? [])
      expect(JSON.parse(line)).toHaveProperty('event');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
