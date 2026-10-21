import type postgres from 'postgres';
import { AppError } from '@/lib/errors';
import { sha256Hex } from '@/lib/hash';
import type { LlmProvider } from '@/lib/llm/types';
import { chunkContentHash, type Chunk } from './chunk';
import { embedBatches } from './embed-batch';
import type { IngestReport } from './report';

export type IngestDocument = {
  slug: string;
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
    const previous = await tx<
      { content_hash: string }[]
    >`SELECT content_hash FROM documents WHERE slug=${document.slug}`;
    const [stored] = await tx<{ id: bigint }[]>`
      INSERT INTO documents (slug,url,title,version,section,content_hash,is_fixture,fetched_at)
      VALUES (${document.slug},${document.url},${document.title},${document.version},${document.section},${document.contentHash},${document.isFixture},now())
      ON CONFLICT (slug) DO UPDATE SET title=EXCLUDED.title,url=EXCLUDED.url,content_hash=EXCLUDED.content_hash,
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
      ON CONFLICT (content_hash) DO UPDATE
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
      WHERE c.content_hash = u.content_hash
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
      deleted: deleted.length,
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
    const documents = (await options.loadDocuments())
      .filter((doc) => includeFixtures || !doc.isFixture)
      .map((doc) => ({
        ...doc,
        chunks: doc.chunks.map((chunk) => ({
          ...chunk,
          contentHash: chunkContentHash(doc.slug, chunk),
        })),
      }));
    const chunks = documents.flatMap((doc) => doc.chunks);
    const hashes = chunks.map((chunk) => chunk.contentHash);
    const rows = await sql<
      { content_hash: string }[]
    >`SELECT content_hash FROM chunks WHERE content_hash = ANY(${sql.array(hashes, 25)}::text[]) AND embedding_model = ${embeddingModel}::text`;
    const known = new Set(rows.map((row) => row.content_hash));
    const missing = chunks.filter((chunk) => !known.has(chunk.contentHash));
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
      corpusVersion: sha256Hex(hashes.sort().join('\n')),
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
      const counts = await upsertDocument(sql, document, known, vectors, embeddingModel);
      report.documentsChanged += counts.changed;
      report.chunksInserted += counts.inserted;
      report.chunksUpdated += counts.updated;
      report.chunksUnchanged += counts.unchanged;
      report.chunksDeleted += counts.deleted;
    }
    const slugs = documents.map((doc) => doc.slug);
    await sql.begin(async (tx) => {
      const removedChunks = await tx<
        { count: number }[]
      >`SELECT count(*)::int AS count FROM chunks WHERE document_id IN (SELECT id FROM documents WHERE NOT (slug = ANY(${tx.array(slugs, 25)}::text[])) OR (is_fixture AND NOT ${includeFixtures}))`;
      const removedDocuments =
        await tx`DELETE FROM documents WHERE NOT (slug = ANY(${tx.array(slugs, 25)}::text[])) OR (is_fixture AND NOT ${includeFixtures}) RETURNING id`;
      report.documentsRemoved = removedDocuments.length;
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
