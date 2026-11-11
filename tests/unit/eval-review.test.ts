import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { editor, select } from '@inquirer/prompts';
import example from '@/sourced.config';
import { KitConfigSchema } from '@/lib/kit/config-schema';
import { loadConfig } from '@/lib/kit/load-config';
import { Candidate, GeneratedGoldenEntry } from '@/lib/eval/generate';
import { parseInvocation } from '@/lib/cli/router';
import { runEvalReview, parseJsonLines } from '@/lib/cli/commands/eval-review';

vi.mock('@inquirer/prompts', () => ({ editor: vi.fn(), select: vi.fn(), confirm: vi.fn() }));
vi.mock('@/lib/kit/load-config', async (original) => ({
  ...(await original<typeof import('@/lib/kit/load-config')>()),
  loadConfig: vi.fn(),
}));
const directories: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

test('UT-47 / FR-83: interactive accept, editor, reject and skip preserve review decisions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sourced-review-'));
  directories.push(root);
  vi.spyOn(process, 'cwd').mockReturnValue(root);
  const config = KitConfigSchema.parse(example);
  vi.mocked(loadConfig).mockResolvedValue(config);
  const directory = join(root, 'eval', config.corpus.name);
  await mkdir(directory, { recursive: true });
  const candidates = [1, 2, 3, 4].map((index) =>
    Candidate.parse({
      id: `q00${String(index)}`,
      type: 'answerable',
      group: 'guide',
      question: 'How can I configure this particular feature?',
      expected_anchors: ['guide.md#configuration'],
      reference_answer: 'Use a configuration file.',
      status: 'pending',
      flags: {},
      sourceChunkId: String(index),
    }),
  );
  await writeFile(
    join(directory, 'candidates.jsonl'),
    candidates.map((entry) => JSON.stringify(entry)).join('\n') + '\n',
  );
  vi.mocked(select)
    .mockResolvedValueOnce('accept')
    .mockResolvedValueOnce('edit')
    .mockResolvedValueOnce('reject')
    .mockResolvedValueOnce('skip');
  vi.mocked(editor).mockResolvedValue(
    JSON.stringify({
      ...candidates[1],
      status: 'accepted',
      reference_answer: 'Use the documented settings in a configuration file.',
    }),
  );
  expect(
    await runEvalReview(parseInvocation(['eval:review']), { isTTY: true, progress: vi.fn() }),
  ).toEqual({ accepted: 2, rejected: 1, edited: 1 });
  const golden = parseJsonLines(
    await readFile(join(directory, 'golden.jsonl'), 'utf8'),
    GeneratedGoldenEntry,
  );
  expect(golden.map((entry) => entry.id)).toEqual(['q001', 'q002']);
  expect(golden.every((entry) => entry.origin === 'generated')).toBe(true);
  expect(golden[1]?.reference_answer).toBe('Use the documented settings in a configuration file.');
  const pending = parseJsonLines(
    await readFile(join(directory, 'candidates.jsonl'), 'utf8'),
    Candidate,
  );
  expect(pending).toEqual([{ ...candidates[2], status: 'rejected' }, candidates[3]]);
});
