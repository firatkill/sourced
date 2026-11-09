import 'server-only';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getEnv } from '@/lib/env';
import { createLogger } from '@/lib/logger';
import { EvalResult } from './results-schema';

export async function loadResults(): Promise<EvalResult[]> {
  const directory = resolve(process.cwd(), getEnv().EVAL_RESULTS_DIR);
  let files: string[];
  try {
    files = await readdir(directory);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
    throw error;
  }
  const runs: EvalResult[] = [];
  for (const file of files.filter((name) => name.endsWith('.json'))) {
    try {
      const content: unknown = JSON.parse(await readFile(resolve(directory, file), 'utf8'));
      const result = EvalResult.safeParse(content);
      if (result.success) {
        runs.push(result.data);
        continue;
      }
    } catch {
      // Invalid or unreadable files must not prevent valid runs from rendering.
    }
    createLogger().warn({ file }, 'Skipping invalid evaluation results file');
  }
  return runs.sort((a, b) => a.runId.localeCompare(b.runId));
}
