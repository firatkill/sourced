import type postgres from 'postgres';
import { AppError } from '@/lib/errors';
import { sha256Hex } from '@/lib/hash';
import type { LlmProvider } from '@/lib/llm/types';
import { chunkContentHash, type Chunk } from './chunk';
import { embedBatches } from './embed-batch';
import type { IngestReport } from './report';

export type IngestDocument = {
  slug: string;
  locationSlug?: string;
  sourceId?: string;
  sourceKind?: 'web' | 'file';
  mimeType?: string;
  url: string;
  title: string;
  version: string;
  section: string;
  contentHash: string;
  isFixture: boolean;
  chunks: Chunk[];
};
type PreparedChunk = Chunk & { contentHash: string };
type PreparedDocument = Omit<IngestDocument, 'chunks'> & { chunks: PreparedChunk[] };

type IngestOptions = {
  sql: postgres.Sql;
  loadDocuments: () => Promise<IngestDocument[]>;
  provider: Pick<LlmProvider, 'embed'>;
  embeddingModel: string;
  includeFixtures: boolean;
  pricePerMillion: number;
  now?: () => number;
};

async function upsertDocument(
  sql: postgres.Sql,
  document: PreparedDocument,
  known: Set<string>,
  vectors: Map<string, number[]>,
  model: string,
) {
  return sql.begin(async (tx) => {
    // D-101: replace v1 identities transactionally before the unique URL is reused.
    const legacyChunks = document.sourceId
      ? await tx`DELETE FROM chunks WHERE document_id IN (SELECT id FROM documents WHERE url=${document.url} AND slug<>${document.slug} AND source_id IS NULL) RETURNING id`
      : [];
    const legacyDocuments = document.sourceId
      ? await tx`DELETE FROM documents WHERE url=${document.url} AND slug<>${document.slug} AND source_id IS NULL RETURNING id`
      : [];
    const previous = await tx<
      { content_hash: string }[]
    >`SELECT content_hash FROM documents WHERE slug=${document.slug}`;
    const [stored] = await tx<{ id: bigint }[]>`
      INSERT INTO documents (slug,url,title,version,section,content_hash,is_fixture,fetched_at,source_id,source_kind,mime_type)
      VALUES (${document.slug},${document.url},${document.title},${document.version},${document.section},${document.contentHash},${document.isFixture},now(),${document.sourceId ?? null},${document.sourceKind ?? null},${document.mimeType ?? null})
      ON CONFLICT (slug) DO UPDATE SET title=EXCLUDED.title,url=EXCLUDED.url,content_hash=EXCLUDED.content_hash,
        source_id=EXCLUDED.source_id,source_kind=EXCLUDED.source_kind,mime_type=EXCLUDED.mime_type,
        fetched_at=EXCLUDED.fetched_at,section=EXCLUDED.section,is_fixture=EXCLUDED.is_fixture,updated_at=now()
      RETURNING id`;
    if (!stored) throw new AppError('INTERNAL_ERROR', 'Document upsert returned no id.');
    const id = String(stored.id);
    const hashes = document.chunks.map((chunk) => chunk.contentHash);
    const deleted =
      await tx`DELETE FROM chunks WHERE document_id=${id} AND (NOT (content_hash = ANY(${tx.array(hashes, 25)}::text[])) OR embedding_model <> ${model}) RETURNING id`;
    const fresh = document.chunks.filter((chunk) => !known.has(chunk.contentHash));
    const existing = document.chunks.filter((chunk) => known.has(chunk.contentHash));
    const inserted = fresh.length
      ? await tx<{ inserted: boolean }[]>`
      INSERT INTO chunks (document_id, ordinal, heading_path, anchor, content, token_count,
                          content_hash, embedding_model, embedding)
      SELECT t.document_id,
             t.ordinal,
             ARRAY(SELECT jsonb_array_elements_text(t.heading_path_json::jsonb)),
             t.anchor,
             t.content,
             t.token_count,
             t.content_hash,
             t.embedding_model,
             t.embedding_text::vector
      FROM unnest(
        ${tx.array(
          fresh.map(() => id),
          20,
        )}::bigint[], ${tx.array(
          fresh.map((chunk) => chunk.ordinal),
          23,
        )}::int[],
        ${tx.array(
          fresh.map((chunk) => JSON.stringify(chunk.headingPath)),
          25,
        )}::text[], ${tx.array(
          fresh.map((chunk) => chunk.anchor),
          25,
        )}::text[],
        ${tx.array(
          fresh.map((chunk) => chunk.content),
          25,
        )}::text[], ${tx.array(
          fresh.map((chunk) => chunk.tokenCount),
          23,
        )}::int[],
        ${tx.array(
          fresh.map((chunk) => chunk.contentHash),
          25,
        )}::text[], ${tx.array(
          fresh.map(() => model),
          25,
        )}::text[],
        ${tx.array(
          fresh.map((chunk) => {
            const vector = vectors.get(chunk.contentHash);
            if (!vector) throw new AppError('INTERNAL_ERROR', 'Missing prepared embedding.');
            return JSON.stringify(vector);
          }),
          25,
        )}::text[]
      ) AS t(document_id, ordinal, heading_path_json, anchor, content,
             token_count, content_hash, embedding_model, embedding_text)
      ON CONFLICT (document_id, content_hash) DO UPDATE
        SET ordinal      = EXCLUDED.ordinal,
            heading_path = EXCLUDED.heading_path,
            anchor       = EXCLUDED.anchor,
            updated_at   = now()
        WHERE chunks.ordinal      IS DISTINCT FROM EXCLUDED.ordinal
           OR chunks.heading_path IS DISTINCT FROM EXCLUDED.heading_path
           OR chunks.anchor       IS DISTINCT FROM EXCLUDED.anchor
      RETURNING (xmax = 0) AS inserted`
      : [];
    const updated = existing.length
      ? await tx`
      UPDATE chunks AS c
      SET ordinal      = u.ordinal,
          heading_path = ARRAY(SELECT jsonb_array_elements_text(u.heading_path_json::jsonb)),
          anchor       = u.anchor,
          updated_at   = now()
      FROM unnest(${tx.array(
        existing.map((chunk) => chunk.contentHash),
        25,
      )}::text[],
        ${tx.array(
          existing.map((chunk) => chunk.ordinal),
          23,
        )}::int[],
        ${tx.array(
          existing.map((chunk) => JSON.stringify(chunk.headingPath)),
          25,
        )}::text[],
        ${tx.array(
          existing.map((chunk) => chunk.anchor),
          25,
        )}::text[])
             AS u(content_hash, ordinal, heading_path_json, anchor)
      WHERE c.document_id = ${id} AND c.content_hash = u.content_hash
        AND (c.ordinal, c.heading_path, c.anchor)
            IS DISTINCT FROM
            (u.ordinal, ARRAY(SELECT jsonb_array_elements_text(u.heading_path_json::jsonb)), u.anchor)
      RETURNING c.id`
      : [];
    return {
      changed: previous[0]?.content_hash !== document.contentHash ? 1 : 0,
      inserted: inserted.filter((row) => row.inserted).length,
      updated: updated.length + inserted.filter((row) => !row.inserted).length,
      unchanged: existing.length - updated.length + fresh.length - inserted.length,
      deleted: deleted.length + legacyChunks.length,
      removed: legacyDocuments.length,
    };
  });
}

export async function ingestCorpus(options: IngestOptions): Promise<IngestReport> {
  const { sql, embeddingModel, includeFixtures } = options;
  const now = options.now ?? Date.now;
  const started = now();
  const [run] = await sql<
    { id: bigint }[]
  >`INSERT INTO ingest_runs (status,include_fixtures,embedding_model) VALUES ('running',${includeFixtures},${embeddingModel}) RETURNING id`;
  if (!run) throw new AppError('INTERNAL_ERROR', 'Ingest run could not be started.');
  const runId = String(run.id);
  try {
    const loaded = await options.loadDocuments();
    const sources =
      'sources' in loaded
        ? (loaded as IngestDocument[] & { sources: { id: string; revision?: string }[] }).sources
        : [];
    const failedKeys =
      'failedKeys' in loaded
        ? (loaded as IngestDocument[] & { failedKeys: string[] }).failedKeys
        : [];
    const documents = loaded
      .filter((doc) => includeFixtures || !doc.isFixture)
      .map((doc) => ({
        ...doc,
        chunks: doc.chunks.map((chunk) => ({
          ...chunk,
          contentHash: chunkContentHash(doc.locationSlug ?? doc.slug, chunk),
        })),
      }));
    const chunks = documents.flatMap((doc) => doc.chunks);
    const hashes = chunks.map((chunk) => chunk.contentHash);
    const rows = await sql<
      { slug: string; content_hash: string }[]
    >`SELECT d.slug,c.content_hash FROM chunks c JOIN documents d ON d.id=c.document_id WHERE c.content_hash = ANY(${sql.array(hashes, 25)}::text[]) AND c.embedding_model = ${embeddingModel}::text`;
    const known = new Map<string, Set<string>>();
    for (const row of rows) {
      const values = known.get(row.slug) ?? new Set<string>();
      values.add(row.content_hash);
      known.set(row.slug, values);
    }
    const missing = documents.flatMap((doc) =>
      doc.chunks.filter((chunk) => !known.get(doc.slug)?.has(chunk.contentHash)),
    );
    const embedded = await embedBatches(
      missing.map((chunk) => `${chunk.headingPath.join(' › ')}\n\n${chunk.content}`),
      { provider: options.provider },
    );
    const vectors = new Map<string, number[]>();
    for (const [index, chunk] of missing.entries()) {
      const vector = embedded.vectors[index];
      if (!vector) throw new AppError('INTERNAL_ERROR', 'Missing embedding result.');
      vectors.set(chunk.contentHash, vector);
    }
    const report: IngestReport = {
      corpusVersion: sha256Hex(
        [
          ...hashes,
          ...sources
            .filter((source) => source.revision)
            .map((source) => `${source.id}:${source.revision ?? ''}`),
        ]
          .sort()
          .join('\n'),
      ),
      sources,
      documentsTotal: documents.length,
      documentsChanged: 0,
      documentsRemoved: 0,
      chunksTotal: chunks.length,
      chunksInserted: 0,
      chunksUpdated: 0,
      chunksUnchanged: 0,
      chunksDeleted: 0,
      embeddingInputs: missing.length,
      embeddingTokens: embedded.tokens,
      costUsdEstimate: (embedded.tokens * options.pricePerMillion) / 1_000_000,
      includeFixtures,
      durationMs: 0,
    };
    for (const document of documents) {
      const counts = await upsertDocument(
        sql,
        document,
        known.get(document.slug) ?? new Set(),
        vectors,
        embeddingModel,
      );
      report.documentsChanged += counts.changed;
      report.documentsRemoved += counts.removed;
      report.chunksInserted += counts.inserted;
      report.chunksUpdated += counts.updated;
      report.chunksUnchanged += counts.unchanged;
      report.chunksDeleted += counts.deleted;
    }
    if (failedKeys.length)
      throw new AppError(
        'INTERNAL_ERROR',
        `Ingestion failed for ${String(failedKeys.length)} source items; successful items were kept.`,
      );
    const slugs = documents.map((doc) => doc.slug);
    const sourceIds = sources.map((source) => source.id);
    const scoped = 'sources' in loaded;
    await sql.begin(async (tx) => {
      const removedChunks = await tx<
        { count: number }[]
      >`SELECT count(*)::int AS count FROM chunks WHERE document_id IN (SELECT id FROM documents WHERE ((NOT ${scoped} OR source_id IS NULL OR source_id = ANY(${tx.array(sourceIds, 25)}::text[])) AND NOT (slug = ANY(${tx.array(slugs, 25)}::text[]))) OR (is_fixture AND NOT ${includeFixtures}))`;
      const removedDocuments =
        await tx`DELETE FROM documents WHERE ((NOT ${scoped} OR source_id IS NULL OR source_id = ANY(${tx.array(sourceIds, 25)}::text[])) AND NOT (slug = ANY(${tx.array(slugs, 25)}::text[]))) OR (is_fixture AND NOT ${includeFixtures}) RETURNING id`;
      report.documentsRemoved += removedDocuments.length;
      report.chunksDeleted += removedChunks[0]?.count ?? 0;
    });
    report.durationMs = now() - started;
    await sql`UPDATE ingest_runs SET status='succeeded',finished_at=now(),corpus_version=${report.corpusVersion},documents_total=${report.documentsTotal},documents_changed=${report.documentsChanged},chunks_inserted=${report.chunksInserted},chunks_updated=${report.chunksUpdated},chunks_unchanged=${report.chunksUnchanged},chunks_deleted=${report.chunksDeleted},embedding_tokens=${report.embeddingTokens},cost_usd_estimate=${report.costUsdEstimate} WHERE id=${runId}`;
    return report;
  } catch (error) {
    const message = error instanceof AppError ? error.message : 'Ingestion failed.';
    await sql`UPDATE ingest_runs SET status='failed',finished_at=now(),error=${message} WHERE id=${runId}`;
    throw error;
  }
}
