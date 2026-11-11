import type postgres from 'postgres';
import { z } from 'zod';
import { join } from 'node:path';
import { CHUNKING, INSPECT } from '@/lib/config';
import type { KitConfig } from '@/lib/kit/config-schema';
import { AppError } from '@/lib/errors';
import { buildFindings } from './findings';
import { InspectResult, InspectSource } from './schema';
import { readRunReport, writeJson } from './run-report';

const Stats = InspectSource.extend({
  tiny: z.number().int().nonnegative(),
  oversized: z.number().int().nonnegative(),
});
const Sample = z.object({
  id: z.string(),
  content: z.string(),
  other_id: z.string().nullable(),
  similarity: z.number().nullable(),
});
const Run = z.object({ id: z.string(), started_at: z.date() });
const Item = z.object({ key: z.string(), status: z.string(), reason: z.string().nullable() });
/** Read-only DB snapshot. At 100k chunks: O(N log 200) sampling + <=200 KNN
 * probes; HNSW usually bounds each probe, sequential fallback is O(200*N*d).
 * No N-by-N join or vectors loaded into JS. Aggregate counts/extrema are exact.
 */
export async function inspectCorpus(
  sql: postgres.Sql,
  config: KitConfig,
  root = process.cwd(),
  source?: string,
): Promise<InspectResult> {
  const ids = config.sources
    .filter((s) => source === undefined || s.id === source)
    .map((s) => s.id);
  if (source !== undefined && !ids.length)
    throw new AppError('VALIDATION_FAILED', 'Unknown source. Run pnpm sourced sources list.');
  const min = config.overrides.chunking.minTokens ?? CHUNKING.MIN_TOKENS;
  const max = config.overrides.chunking.maxTokens ?? CHUNKING.MAX_TOKENS;
  const data = await sql.begin('isolation level repeatable read read only', async (tx) => {
    const stats = z.array(Stats).parse(
      await tx`
      SELECT d.source_id AS id, count(DISTINCT d.id)::int AS documents, count(c.id)::int AS chunks,
        min(c.token_count) AS "smallestChunkTokens", max(c.token_count) AS "largestChunkTokens",
        count(c.id) FILTER (WHERE c.token_count < ${min / 2})::int AS tiny,
        count(c.id) FILTER (WHERE c.token_count > ${max})::int AS oversized
      FROM documents d LEFT JOIN chunks c ON c.document_id=d.id
      WHERE d.source_id = ANY(${tx.array(ids, 25)}::text[]) GROUP BY d.source_id`,
    );
    const runs = z
      .array(Run)
      .parse(await tx`SELECT id::text, started_at FROM ingest_runs ORDER BY id DESC LIMIT 1`);
    const run = runs[0];
    const items = run
      ? z.array(Item).parse(
          await tx`
      SELECT document_key AS key, status, error AS reason FROM ingest_items
      WHERE run_id=${run.id} AND split_part(document_key, ':', 1) = ANY(${tx.array(ids, 25)}::text[])
      ORDER BY document_key`,
        )
      : [];
    if (!run && !stats.some((s) => s.chunks))
      throw new AppError('CORPUS_EMPTY', 'Nothing is indexed yet.');
    // MATERIALIZED bounds KNN probes. The operator sorts the bare embedding column
    // (vector or halfvec), so its cosine HNSW operator class remains usable.
    const samples = z.array(Sample).parse(
      await tx`
      WITH sample AS MATERIALIZED (
        SELECT c.id, c.document_id, c.embedding, c.content FROM chunks c
        JOIN documents d ON d.id=c.document_id
        WHERE d.source_id = ANY(${tx.array(ids, 25)}::text[])
        ORDER BY md5(c.id::text), c.id LIMIT ${INSPECT.SAMPLE_CHUNKS}
      )
      SELECT s.id::text, s.content, nearest.id::text AS other_id, 1-nearest.distance AS similarity
      FROM sample s LEFT JOIN LATERAL (
        SELECT c.id, c.embedding <=> s.embedding AS distance FROM chunks c
        WHERE c.document_id <> s.document_id
          AND c.document_id IN (SELECT id FROM documents WHERE source_id = ANY(${tx.array(ids, 25)}::text[]))
        ORDER BY c.embedding <=> s.embedding LIMIT 1
      ) nearest ON true ORDER BY s.id`,
    );
    return { stats, run, items, samples };
  });
  const stored = data.run
    ? await readRunReport(root, config.corpus.name, data.run.id, data.run.started_at)
    : null;
  const result = InspectResult.parse({
    corpus: config.corpus.name,
    sources: ids.map(
      (id) =>
        data.stats.find((s) => s.id === id) ?? {
          id,
          documents: 0,
          chunks: 0,
          smallestChunkTokens: null,
          largestChunkTokens: null,
        },
    ),
    findings: buildFindings({
      totalChunks: data.stats.reduce((n, s) => n + s.chunks, 0),
      tinyChunks: data.stats.reduce((n, s) => n + s.tiny, 0),
      oversizedChunks: data.stats.reduce((n, s) => n + s.oversized, 0),
      sample: data.samples.map((s) => s.content),
      language: config.corpus.language,
      duplicates: data.samples.flatMap((s) =>
        s.other_id !== null && s.similarity !== null
          ? [{ chunkId: s.id, otherChunkId: s.other_id, similarity: s.similarity }]
          : [],
      ),
      items: data.items,
      boilerplate: ids.map((id) => ({
        id,
        count: stored?.sources.find((s) => s.id === id)?.boilerplateRemoved ?? null,
      })),
    }),
    path: `corpus/${config.corpus.name}/inspect.json`,
  });
  await writeJson(join(root, result.path), result);
  return result;
}
