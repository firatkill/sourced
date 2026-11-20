import 'server-only';
// T-89 / R2 §6 (ingest from the browser): the server runs the same `runIngest` as the
// CLI, with `--yes` semantics, one run at a time. The job lives on `globalThis`, so every
// route bundle in the process sees it; progress comes from `ingest_runs` and
// `ingest_items`, so closing the tab neither stops the run nor loses its state.
import type postgres from 'postgres';
import { z } from 'zod';
import { AppError } from '@/lib/errors';
import { reloadKitConfig } from '@/lib/kit/runtime-config';
import type { IngestResult } from '@/lib/cli/schemas/ingest';
import type { KitConfig } from '@/lib/kit/config-schema';
import { readConfig } from './config';

export const JobStatus = z.enum(['preparing', 'running', 'succeeded', 'failed']);
export type IngestJob = {
  id: string;
  status: z.infer<typeof JobStatus>;
  rebuild: boolean;
  startedAt: string;
  finishedAt: string | null;
  runId: string | null;
  error: { code: string; message: string } | null;
};
export type IngestProgress = IngestJob & {
  documents: { total: number; done: number; failed: number; skipped: number };
};

const store = globalThis as typeof globalThis & { __sourcedIngestJob?: IngestJob };
export function currentJob(): IngestJob | null {
  return store.__sourcedIngestJob ?? null;
}
export function resetIngestJobForTests(): void {
  delete store.__sourcedIngestJob;
}

const PEOPLE_MESSAGES = new Set([
  'CORPUS_EMPTY',
  'CORPUS_MISMATCH',
  'CONFIG_INVALID',
  'NEEDS_CONFIRMATION',
  'VALIDATION_FAILED',
]);
function failure(error: unknown): { code: string; message: string } {
  if (error instanceof AppError)
    return {
      code: error.code,
      // Provider failures can quote a response; only CLI-written messages pass through.
      message: PEOPLE_MESSAGES.has(error.code)
        ? error.message
        : error.code === 'PROVIDER_ERROR' || error.code === 'PROVIDER_TIMEOUT'
          ? 'The embedding provider did not respond. Check the key in Settings, then try again.'
          : 'Indexing stopped unexpectedly. Try again; finished documents are kept.',
    };
  return {
    code: 'INTERNAL_ERROR',
    message: 'Indexing stopped unexpectedly. Try again; finished documents are kept.',
  };
}

type Runner = (options: { rebuild: boolean }) => Promise<unknown>;
const defaultRunner: Runner = async ({ rebuild }) => {
  const { runIngest } = await import('@/lib/cli/commands/ingest');
  return runIngest(
    {
      command: 'ingest',
      values: { yes: true, ...(rebuild ? { rebuild: true } : {}) },
      positionals: [],
      json: true,
    },
    { progress: () => undefined, isTTY: false },
    { config: readConfig() },
  );
};

/** Starts a run, or returns the one already going (R2 §6: one run at a time). */
export function startIngest(options: { rebuild?: boolean } = {}, runner = defaultRunner) {
  const existing = currentJob();
  if (existing && (existing.status === 'preparing' || existing.status === 'running'))
    return { job: existing, started: false };
  const job: IngestJob = {
    id: crypto.randomUUID(),
    status: 'preparing',
    rebuild: options.rebuild === true,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    runId: null,
    error: null,
  };
  store.__sourcedIngestJob = job;
  void runner({ rebuild: job.rebuild })
    .then((result) => {
      const runId = (result as Partial<IngestResult> | undefined)?.runId ?? null;
      Object.assign(job, { status: 'succeeded', runId: runId ?? job.runId });
    })
    .catch((error: unknown) => {
      Object.assign(job, { status: 'failed', error: failure(error) });
    })
    .finally(() => {
      job.finishedAt = new Date().toISOString();
      reloadKitConfig();
    });
  return { job, started: true };
}

/** The dry run behind the cost confirm: nothing is sent to a provider. */
export async function estimateIngest(options: { rebuild?: boolean; config?: KitConfig } = {}) {
  const { runIngest } = await import('@/lib/cli/commands/ingest');
  const result = await runIngest(
    {
      command: 'ingest',
      values: { 'dry-run': true, ...(options.rebuild ? { rebuild: true } : {}) },
      positionals: [],
      json: true,
    },
    { progress: () => undefined, isTTY: false },
    // T-91: a candidate configuration (a new embedding model) is estimated before it is saved.
    { config: options.config ?? readConfig() },
  );
  reloadKitConfig();
  return result;
}

export async function ingestProgress(sql: postgres.Sql): Promise<IngestProgress | null> {
  const job = currentJob();
  if (!job) return null;
  if (!job.runId) {
    // The run row appears once documents are loaded and planned.
    const [row] = await sql<{ id: bigint }[]>`
      SELECT id FROM ingest_runs WHERE started_at >= ${new Date(job.startedAt)}
      ORDER BY id DESC LIMIT 1`;
    if (row) job.runId = String(row.id);
  }
  if (job.runId && job.status === 'preparing') job.status = 'running';
  let documents = { total: 0, done: 0, failed: 0, skipped: 0 };
  if (job.runId) {
    const [counts] = await sql<{ total: number; done: number; failed: number; skipped: number }[]>`
      SELECT count(*)::int AS total,
        count(*) FILTER (WHERE status = 'done')::int AS done,
        count(*) FILTER (WHERE status = 'failed')::int AS failed,
        count(*) FILTER (WHERE status = 'skipped')::int AS skipped
      FROM ingest_items WHERE run_id = ${job.runId}::bigint`;
    if (counts) documents = counts;
  }
  return { ...job, documents };
}

/** The numbers behind the cost confirm (setup step 4, Settings rebuild). */
export async function estimateSummary(options: { rebuild?: boolean; config?: KitConfig } = {}) {
  const result = (await estimateIngest(options)) as {
    totals: {
      documents: { discovered: number; skipped: number };
      embeddingTokens: number;
      estimatedCostUsd: number | null;
    };
    warnings?: { code: string }[];
  };
  const { getEnv } = await import('@/lib/env');
  const env = getEnv();
  const embed = (options.config ?? readConfig()).models.embed;
  return {
    documents: result.totals.documents.discovered,
    skipped: result.totals.documents.skipped,
    embeddingTokens: result.totals.embeddingTokens,
    estimatedCostUsd: result.totals.estimatedCostUsd,
    // Mock mode replaces every provider, so the page says nothing leaves the computer.
    provider: env.LLM_MODE === 'mock' ? 'mock' : embed.provider,
    model: env.LLM_MODE === 'mock' ? 'mock' : embed.model,
    rebuildRequired: (result.warnings ?? []).some((w) => w.code === 'CORPUS_MISMATCH'),
    confirmAboveUsd: env.INGEST_CONFIRM_ABOVE_USD,
  };
}
