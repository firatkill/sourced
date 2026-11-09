import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { loadResults } from '@/lib/eval/load-results';
import { resetEnvForTests } from '@/lib/env';
import { EvalResult } from '@/lib/eval/results-schema';
import older from '../fixtures/eval-results/2026-11-01.json';
import newer from '../fixtures/eval-results/2026-11-02.json';

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ warn }) }));
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  resetEnvForTests();
});
async function directory() {
  const path = await mkdtemp(join(tmpdir(), 'sourced-eval-'));
  directories.push(path);
  vi.stubEnv('EVAL_RESULTS_DIR', relative(process.cwd(), path));
  resetEnvForTests();
  return path;
}

test('TC-132: validates fixtures, sorts by runId rather than filename, warns without file contents', async () => {
  const path = await directory();
  await Promise.all([
    writeFile(join(path, 'a.json'), JSON.stringify(newer)),
    writeFile(join(path, 'z.json'), JSON.stringify(older)),
    writeFile(
      join(path, 'invalid-schema.json'),
      JSON.stringify({ privateContent: 'must not log' }),
    ),
    writeFile(join(path, 'invalid-json.json'), '{must not log'),
    writeFile(join(path, 'ignored.md'), 'must not parse'),
    mkdir(join(path, 'unreadable.json')),
  ]);
  expect(await loadResults()).toEqual([EvalResult.parse(older), EvalResult.parse(newer)]);
  expect(warn).toHaveBeenCalledTimes(3);
  for (const file of ['invalid-schema.json', 'invalid-json.json', 'unreadable.json']) {
    expect(warn).toHaveBeenCalledWith({ file }, 'Skipping invalid evaluation results file');
  }
  expect(JSON.stringify(warn.mock.calls)).not.toContain('must not log');
});

test('TC-131 / TC-132: empty, absent and all-invalid directories produce no runs', async () => {
  const path = await directory();
  expect(await loadResults()).toEqual([]);
  await writeFile(join(path, 'invalid.json'), '{}');
  expect(await loadResults()).toEqual([]);
  await rm(path, { recursive: true });
  expect(await loadResults()).toEqual([]);
});
