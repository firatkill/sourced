import { mkdir, readFile, rename, writeFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { AppError } from '@/lib/errors';
import { IngestResult } from '@/lib/cli/schemas/ingest';
const StoredReport = z.object({ startedAt: z.iso.datetime(), report: IngestResult });
function reportPath(root: string, corpus: string, runId: string) {
  return join(root, '.sourced', 'ingest', corpus, `${runId}.json`);
}
export async function writeJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${crypto.randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}
/** Persist the run's planned report before embedding, including failed/interrupted runs. */
export async function writeRunReport(
  root: string,
  corpus: string,
  startedAt: Date,
  report: IngestResult,
) {
  if (!report.runId)
    throw new AppError('INTERNAL_ERROR', 'A persisted ingest report requires a run id.');
  await writeJson(
    reportPath(root, corpus, report.runId),
    StoredReport.parse({ startedAt: startedAt.toISOString(), report }),
  );
}
export async function readRunReport(root: string, corpus: string, runId: string, startedAt: Date) {
  let raw: string;
  try {
    raw = await readFile(reportPath(root, corpus, runId), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
  const stored = StoredReport.parse(JSON.parse(raw));
  // A database reset can reuse an id. Never attribute its old counts to a new run.
  return stored.startedAt === startedAt.toISOString() && stored.report.runId === runId
    ? stored.report
    : null;
}
