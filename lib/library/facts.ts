import 'server-only';
import { z } from 'zod';
import type postgres from 'postgres';
import { getSql } from '@/lib/db/client';
import type { LibraryFacts } from './format';

const Row = z.object({
  documents: z.number().int().nonnegative(),
  file_sources: z.array(z.string()).nullable(),
  web_hosts: z.array(z.string()).nullable(),
  last_ingest_at: z.date().nullable(),
});

/** REDESIGN-v2 §3.3: facts come from the index, never from configuration copy. */
export async function getLibraryFacts(sql: postgres.Sql = getSql()): Promise<LibraryFacts> {
  const rows = await sql`
    SELECT
      (SELECT count(*)::integer FROM documents WHERE NOT is_fixture) AS documents,
      (SELECT array_agg(DISTINCT source_id ORDER BY source_id) FROM documents
        WHERE NOT is_fixture AND source_kind = 'file' AND source_id IS NOT NULL) AS file_sources,
      (SELECT array_agg(DISTINCT host ORDER BY host) FROM (
        SELECT regexp_replace(substring(url FROM '^[a-zA-Z][a-zA-Z0-9+.-]*://([^/:?#]+)'),
          '^www\\.', '') AS host
        FROM documents WHERE NOT is_fixture AND source_kind IS DISTINCT FROM 'file'
      ) AS hosts WHERE host IS NOT NULL) AS web_hosts,
      (SELECT max(finished_at) FROM ingest_runs WHERE status = 'succeeded') AS last_ingest_at`;
  const row = Row.parse(rows[0]);
  return {
    documents: row.documents,
    sources: [...(row.file_sources ?? []).map((id) => `${id}/`), ...(row.web_hosts ?? [])],
    lastIngestAt: row.last_ingest_at?.toISOString() ?? null,
  };
}
