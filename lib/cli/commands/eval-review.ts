import { readFile, mkdir, writeFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { editor, select } from '@inquirer/prompts';
import { z } from 'zod';
import { AppError } from '@/lib/errors';
import { loadConfig } from '@/lib/kit/load-config';
import { GoldenEntry } from '@/lib/eval/golden';
import { Candidate, GeneratedGoldenEntry } from '@/lib/eval/generate';
import type { CommandContext, Invocation } from '../router';

export function parseJsonLines<T>(text: string, schema: z.ZodType<T>): T[] {
  return text
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => schema.parse(JSON.parse(line)));
}
export const jsonLines = (entries: readonly unknown[]) =>
  entries.length ? entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n' : '';

export async function readOptionalFile(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return '';
    throw error;
  }
}

export function applyCandidates(
  candidates: readonly Candidate[],
  golden: readonly z.infer<typeof GeneratedGoldenEntry>[],
  yes: boolean,
) {
  const entries = [...golden];
  const remaining: Candidate[] = [];
  const used = new Set(entries.map((entry) => entry.id));
  let accepted = 0;
  let rejected = 0;
  for (const candidate of candidates) {
    if (candidate.status === 'rejected') {
      remaining.push(candidate);
      rejected++;
      continue;
    }
    if (
      candidate.status !== 'accepted' ||
      (yes && (candidate.type === 'unanswerable' || candidate.flags.needsHumanCheck))
    ) {
      remaining.push(candidate);
      continue;
    }
    let index = 1;
    while (used.has(`q${String(index).padStart(3, '0')}`)) index++;
    const id = `q${String(index).padStart(3, '0')}`;
    const entry = GeneratedGoldenEntry.parse({ ...candidate, id, origin: 'generated' });
    entries.push(entry);
    used.add(id);
    accepted++;
  }
  return { entries, remaining, accepted, rejected };
}

export async function runEvalReview(input: Invocation, context: CommandContext) {
  const config = await loadConfig(process.cwd(), { writeSnapshot: false });
  const directory = join(process.cwd(), 'eval', config.corpus.name);
  const candidatePath = join(directory, 'candidates.jsonl');
  const goldenPath = join(directory, 'golden.jsonl');
  const candidates = parseJsonLines(await readFile(candidatePath, 'utf8'), Candidate);
  const goldenText = await readOptionalFile(goldenPath);
  const golden = parseJsonLines(
    goldenText,
    z.union([
      GeneratedGoldenEntry,
      GoldenEntry.transform(({ chapter, ...entry }) => ({
        ...entry,
        group: chapter,
        origin: 'handwritten' as const,
      })),
    ]),
  );
  let edited = 0;
  if (!input.values.apply) {
    if (input.json || !context.isTTY)
      throw new AppError(
        'NEEDS_CONFIRMATION',
        'Edit candidates.jsonl statuses and run eval:review --apply.',
      );
    for (const [index, candidate] of candidates.entries()) {
      if (candidate.status !== 'pending') continue;
      const action = await select(
        {
          message: JSON.stringify(candidate, null, 2),
          choices: ['accept', 'edit', 'reject', 'skip'].map((value) => ({ value })),
        },
        { output: process.stderr },
      );
      if (action === 'edit') {
        candidates[index] = Candidate.parse(
          JSON.parse(
            await editor(
              {
                message:
                  'Edit this candidate, including its status, then save and close the editor.',
                default: JSON.stringify(candidate, null, 2),
              },
              { output: process.stderr },
            ),
          ),
        );
        edited++;
      } else if (action !== 'skip')
        candidate.status = action === 'accept' ? 'accepted' : 'rejected';
    }
  }
  const result = applyCandidates(candidates, golden, input.values.yes === true);
  await mkdir(directory, { recursive: true });
  // Keep accepted entries in golden; remove accepted candidates so rerunning does not append them again.
  const appended = result.entries.slice(golden.length);
  if (appended.length)
    await appendFile(
      goldenPath,
      (goldenText && !goldenText.endsWith('\n') ? '\n' : '') + jsonLines(appended),
      'utf8',
    );
  await writeFile(candidatePath, jsonLines(result.remaining), 'utf8');
  return { accepted: result.accepted, rejected: result.rejected, edited };
}
