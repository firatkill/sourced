import { spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import {
  currentCacheVersion,
  writeAnswerCache,
  CachedAnswerPayload,
} from '@/lib/cache/answer-cache';
import { closeSqlForTests } from '@/lib/db/client';
import { getEnv } from '@/lib/env';
import { answerQuestion } from '@/lib/generation/answer';
import { SUGGESTED } from '@/lib/suggested';
import type { SseEvent } from '@/lib/sse/events';

export async function cacheSuggested(): Promise<number> {
  const version = await currentCacheVersion();
  if (!version) throw new Error('Run ingestion before caching suggested answers.');
  let cost = 0;
  for (const suggested of SUGGESTED) {
    try {
      const events: SseEvent[] = [];
      const result = await answerQuestion({
        question: suggested.question,
        requestId: randomUUID(),
        signal: new AbortController().signal,
        emit: (event) => events.push(event),
      });
      const meta = events.find((event) => event.event === 'meta')?.data;
      const citations = events.find((event) => event.event === 'citations')?.data;
      const done = events.find((event) => event.event === 'done')?.data;
      if (!meta || !citations || !done || citations.notFound || citations.valid.length === 0) {
        throw new Error(`Suggested answer failed: ${suggested.id} (${suggested.question})`);
      }
      await writeAnswerCache({
        suggestedId: suggested.id,
        question: suggested.question,
        version,
        payload: CachedAnswerPayload.parse({
          meta,
          answerText: citations.answer,
          citations,
          usageAtGeneration: done.usage,
          costUsdAtGeneration: done.costUsdEstimate,
        }),
      });
      cost += result.done.costUsdEstimate;
    } catch {
      throw new Error(`Suggested answer failed: ${suggested.id} (${suggested.question})`);
    }
  }
  return cost;
}

/** Set mock mode in a child before any env reads, without mutating process.env. */
export async function seedSuggestedCache(): Promise<void> {
  const { stdout } = await promisify(execFile)('pnpm', ['cache:suggested', '--mock']);
  process.stdout.write(stdout);
}

async function main(): Promise<void> {
  if (process.argv.includes('--mock')) {
    const child = spawn(
      'pnpm',
      [
        'exec',
        'cross-env',
        'LLM_MODE=mock',
        'tsx',
        '--conditions=react-server',
        '--env-file-if-exists=.env.local',
        'scripts/cache-suggested.ts',
        '--mock-worker',
      ],
      { stdio: 'inherit' },
    );
    process.exitCode = await new Promise<number>((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code) => {
        resolve(code ?? 1);
      });
    });
    return;
  }
  const mode = process.argv.includes('--mock-worker') ? 'mock' : 'live';
  if (getEnv().LLM_MODE !== mode)
    throw new Error('cache:suggested requires live mode unless --mock is supplied.');
  try {
    const cost = await cacheSuggested();
    console.log(
      `Cached ${String(SUGGESTED.length)} suggested answers. Estimated cost: $${cost.toFixed(6)}`,
    );
  } finally {
    await closeSqlForTests();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    // Only our precondition/verification messages are safe to print.
    console.error(
      error instanceof Error &&
        /^(Suggested answer failed:|Run ingestion|cache:suggested requires)/.test(error.message)
        ? error.message
        : 'Suggested answer caching failed.',
    );
    process.exitCode = 1;
  }
}
