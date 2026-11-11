import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, vi } from 'vitest';
import { loadBaseline, readGitSha } from '@/lib/eval/run';
import { EvalResult } from '@/lib/eval/results-schema';

const unavailable = [
  [
    'missing executable',
    () => Object.assign(new Error('spawnSync git ENOENT'), { code: 'ENOENT' }),
  ],
  [
    'outside repository',
    () =>
      Object.assign(new Error('Git failed'), {
        status: 128,
        stderr: Buffer.from(
          'fatal: not a git repository (or any of the parent directories): .git\n',
        ),
      }),
  ],
] as const;

// D-132 / FR-84: optional Git must not prevent kit evaluation.
test.each(unavailable)(
  '%s records none and selects the newest valid disk baseline',
  async (_name, failure) => {
    const directory = await mkdtemp(join(tmpdir(), 'sourced-eval-baselines-'));
    const git = vi.fn((): string => {
      throw failure();
    });
    const onUnavailable = vi.fn();
    try {
      const template = EvalResult.parse(
        JSON.parse(await readFile('tests/fixtures/eval-results/2026-11-01.json', 'utf8')),
      );
      const newest = { ...template, runId: '2026-11-11T12:00:00Z' };
      await writeFile(
        join(directory, 'older.json'),
        JSON.stringify({ ...template, runId: '2026-11-10T12:00:00Z' }),
      );
      await writeFile(join(directory, 'newest.json'), JSON.stringify(newest));
      await writeFile(join(directory, 'broken.json'), '{');
      await writeFile(join(directory, 'invalid.json'), JSON.stringify({ runId: '9999' }));
      const output = join(directory, 'output.json');
      await writeFile(output, JSON.stringify({ ...template, runId: '2026-11-12T12:00:00Z' }));
      expect(readGitSha({ git, onUnavailable })).toBe('none');
      expect(onUnavailable).toHaveBeenCalledTimes(1);
      onUnavailable.mockClear();
      expect(await loadBaseline(undefined, directory, output, { git, onUnavailable })).toEqual({
        file: join(directory, 'newest.json'),
        result: newest,
      });
      expect(onUnavailable).toHaveBeenCalledTimes(1);
      expect(await loadBaseline(undefined, join(directory, 'missing'), output, { git })).toBeNull();
      await rm(join(directory, 'older.json'));
      await rm(join(directory, 'newest.json'));
      expect(await loadBaseline(undefined, directory, output, { git })).toBeNull();
      git.mockClear();
      expect(await loadBaseline(output, directory, output, { git })).toMatchObject({
        file: output,
      });
      expect(git).not.toHaveBeenCalled();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test('D-132 preserves the Git SHA and does not hide unrelated Git errors', async () => {
  const onUnavailable = vi.fn();
  expect(readGitSha({ git: () => 'abc123\n', onUnavailable })).toBe('abc123');
  expect(onUnavailable).not.toHaveBeenCalled();
  const error = Object.assign(new Error('permission denied'), { code: 'EACCES' });
  const git = (): string => {
    throw error;
  };
  expect(() => readGitSha({ git, onUnavailable })).toThrow(error);
  await expect(
    loadBaseline(undefined, 'unused', 'output.json', { git, onUnavailable }),
  ).rejects.toThrow(error);
  expect(onUnavailable).not.toHaveBeenCalled();
});
