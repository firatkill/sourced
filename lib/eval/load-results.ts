import 'server-only';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getEnv } from '@/lib/env';
import { getKitConfig } from '@/lib/kit/runtime-config';
import { createLogger } from '@/lib/logger';
import { EvalResult } from './results-schema';

/** T-86: the configured corpus's results unless EVAL_RESULTS_DIR points elsewhere (tests, E2E). */
export function resultsDirectory(): string {
  return getEnv().EVAL_RESULTS_DIR ?? `eval/${getKitConfig().corpus.name}/results`;
}

export async function loadResults(): Promise<Array<EvalResult & { sourceFile: string }>> {
  const directory = resolve(process.cwd(), resultsDirectory());
  let files: string[];
  try {
    files = await readdir(directory);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
    throw error;
  }
  const runs: Array<EvalResult & { sourceFile: string }> = [];
  for (const file of files.filter((name) => name.endsWith('.json'))) {
    try {
      const content: unknown = JSON.parse(await readFile(resolve(directory, file), 'utf8'));
      const result = EvalResult.safeParse(content);
      if (result.success) {
        runs.push({ ...result.data, sourceFile: file });
        continue;
      }
    } catch {
      // Invalid or unreadable files must not prevent valid runs from rendering.
    }
    createLogger().warn({ file }, 'Skipping invalid evaluation results file');
  }
  return runs.sort((a, b) => a.runId.localeCompare(b.runId));
}
