import type postgres from 'postgres';
import { AppError } from '@/lib/errors';

export class IngestInterrupted extends Error {
  constructor() {
    super('interrupted');
    this.name = 'AbortPromptError';
  }
}
export async function startRun(
  sql: postgres.Sql,
  options: {
    configHash?: string;
    restart?: boolean;
    includeFixtures: boolean;
    embeddingModel: string;
  },
): Promise<string> {
  if (options.configHash && !options.restart) {
    const [run] = await sql<
      { id: bigint }[]
    >`SELECT id FROM ingest_runs WHERE config_hash=${options.configHash} AND status IN ('running','failed') ORDER BY id DESC LIMIT 1`;
    if (run) {
      await sql`UPDATE ingest_runs SET status='running',error=NULL,finished_at=NULL WHERE id=${String(run.id)}`;
      return String(run.id);
    }
  }
  const [run] = await sql<
    { id: bigint }[]
  >`INSERT INTO ingest_runs (status,include_fixtures,embedding_model,config_hash) VALUES ('running',${options.includeFixtures},${options.embeddingModel},${options.configHash ?? null}) RETURNING id`;
  if (!run) throw new AppError('INTERNAL_ERROR', 'Ingest run could not be started.');
  return String(run.id);
}
export async function prepareItems(
  sql: postgres.Sql,
  runId: string,
  keys: string[],
  skipped: { key: string; reason: string }[],
  failed: string[],
) {
  for (const key of new Set(keys))
    await sql`INSERT INTO ingest_items (run_id,document_key,status) VALUES (${runId},${key},'pending') ON CONFLICT DO NOTHING`;
  for (const item of skipped)
    await sql`UPDATE ingest_items SET status='skipped',error=${item.reason},updated_at=now() WHERE run_id=${runId} AND document_key=${item.key} AND status<>'done'`;
  for (const key of failed)
    await sql`UPDATE ingest_items SET status='failed',error='Source item failed.',updated_at=now() WHERE run_id=${runId} AND document_key=${key} AND status<>'done'`;
  const rows = await sql<
    { document_key: string }[]
  >`SELECT document_key FROM ingest_items WHERE run_id=${runId} AND status='done'`;
  return new Set(rows.map((row) => row.document_key));
}
