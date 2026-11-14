import type postgres from 'postgres';
import { EMBEDDING } from '@/lib/config';
import { startRun, prepareItems, IngestInterrupted } from './checkpoint';
import { AppError } from '@/lib/errors';
import { sha256Hex } from '@/lib/hash';
import type { LlmProvider } from '@/lib/llm/types';
import { getKitConfig } from '@/lib/kit/runtime-config';
import { chunkEmbeddingInput, chunkContentHash, type Chunk } from './chunk';
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
export function prepareChunkEmbedding(
  document: Pick<IngestDocument, 'title' | 'slug' | 'locationSlug'>,
  chunk: Chunk,
  contextualEmbedding: boolean,
) {
  const embeddingInput = chunkEmbeddingInput(document.title, chunk, contextualEmbedding);
  const embedTextVersion = contextualEmbedding ? 1 : 0;
  const contentHash = contextualEmbedding
    ? sha256Hex(`${String(embedTextVersion)}\0${embeddingInput}`)
    : chunkContentHash(document.locationSlug ?? document.slug, chunk);
  return { embeddingInput, embedTextVersion, contentHash };
}
type PreparedChunk = Chunk & ReturnType<typeof prepareChunkEmbedding>;
type PreparedDocument = Omit<IngestDocument, 'chunks'> & { chunks: PreparedChunk[] };

type IngestOptions = {
  sql: postgres.Sql;
  loadDocuments: () => Promise<IngestDocument[] & { warnings?: number }>;
  provider: Pick<LlmProvider, 'embed'>;
  embeddingModel: string;
  includeFixtures: boolean;
  pricePerMillion: number;
  now?: () => number;
  contextualEmbedding?: boolean;
  configHash?: string;
  restart?: boolean;
  signal?: AbortSignal;
  onRunStarted?: (runId: string) => Promise<void>;
  onDocument?: (key: string) => void | Promise<void>;
  onProgress?: (message: string) => void;
};

async function upsertDocument(
  sql: postgres.Sql,
  document: PreparedDocument,
  known: Set<string>,
  provider: Pick<LlmProvider, 'embed'>,
  model: string,
  runId: string,
  price: number,
) {
  return sql.begin(async (tx) => {
    const missing = document.chunks.filter((chunk) => !known.has(chunk.contentHash));
    const embedded = await embedBatches(
      missing.map((chunk) => chunk.embeddingInput),
      { provider, concurrency: 1 },
    );
    const vectors = new Map<string, number[]>();
    for (const [index, chunk] of missing.entries()) {
      const vector = embedded.vectors[index];
      if (!vector) throw new AppError('INTERNAL_ERROR', 'Missing embedding result.');
      vectors.set(chunk.contentHash, vector);
    }
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
                          content_hash, embedding_model, embedding, page_from, page_to, embed_text_version)
      SELECT t.document_id,
             t.ordinal,
             ARRAY(SELECT jsonb_array_elements_text(t.heading_path_json::jsonb)),
             t.anchor,
             t.content,
             t.token_count,
             t.content_hash,
             t.embedding_model,
             t.embedding_text::vector, t.page_from, t.page_to, t.embed_text_version
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
        )}::text[], ${tx.array(
          fresh.map((chunk) => chunk.pageFrom ?? null),
          23,
        )}::int[],
        ${tx.array(
          fresh.map((chunk) => chunk.pageTo ?? null),
          23,
        )}::int[], ${tx.array(
          fresh.map((chunk) => chunk.embedTextVersion),
          21,
        )}::smallint[]
      ) AS t(document_id, ordinal, heading_path_json, anchor, content,
             token_count, content_hash, embedding_model, embedding_text, page_from, page_to, embed_text_version)
      ON CONFLICT (document_id, content_hash) DO UPDATE
        SET ordinal      = EXCLUDED.ordinal,
            heading_path = EXCLUDED.heading_path,
            anchor       = EXCLUDED.anchor,
            page_from    = EXCLUDED.page_from,
            page_to      = EXCLUDED.page_to,
            updated_at   = now()
        WHERE chunks.ordinal      IS DISTINCT FROM EXCLUDED.ordinal
           OR chunks.heading_path IS DISTINCT FROM EXCLUDED.heading_path
           OR chunks.anchor       IS DISTINCT FROM EXCLUDED.anchor
           OR chunks.page_from IS DISTINCT FROM EXCLUDED.page_from
           OR chunks.page_to IS DISTINCT FROM EXCLUDED.page_to
      RETURNING (xmax = 0) AS inserted`
      : [];
    const updated = existing.length
      ? await tx`
      UPDATE chunks AS c
      SET ordinal      = u.ordinal,
          heading_path = ARRAY(SELECT jsonb_array_elements_text(u.heading_path_json::jsonb)),
          anchor       = u.anchor,
          page_from    = u.page_from,
          page_to      = u.page_to,
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
        )}::text[], ${tx.array(
          existing.map((chunk) => chunk.pageFrom ?? null),
          23,
        )}::int[],
        ${tx.array(
          existing.map((chunk) => chunk.pageTo ?? null),
          23,
        )}::int[])
             AS u(content_hash, ordinal, heading_path_json, anchor, page_from, page_to)
      WHERE c.document_id = ${id} AND c.content_hash = u.content_hash
        AND (c.ordinal, c.heading_path, c.anchor, c.page_from, c.page_to)
            IS DISTINCT FROM
            (u.ordinal, ARRAY(SELECT jsonb_array_elements_text(u.heading_path_json::jsonb)), u.anchor, u.page_from, u.page_to)
      RETURNING c.id`
      : [];
    const counts = {
      changed: previous[0]?.content_hash !== document.contentHash ? 1 : 0,
      inserted: inserted.filter((row) => row.inserted).length,
      updated: updated.length + inserted.filter((row) => !row.inserted).length,
      unchanged: existing.length - updated.length + fresh.length - inserted.length,
      deleted: deleted.length + legacyChunks.length,
      removed: legacyDocuments.length,
    };
    await tx`UPDATE ingest_items SET status='done',chunks=${document.chunks.length},tokens=${embedded.tokens},error=NULL,updated_at=now() WHERE run_id=${runId} AND document_key=${document.slug}`;
    await tx`UPDATE ingest_runs SET documents_changed=documents_changed+${counts.changed}, chunks_inserted=chunks_inserted+${counts.inserted}, chunks_updated=chunks_updated+${counts.updated}, chunks_unchanged=chunks_unchanged+${counts.unchanged}, chunks_deleted=chunks_deleted+${counts.deleted}, embedding_tokens=embedding_tokens+${embedded.tokens}, cost_usd_estimate=cost_usd_estimate+${(embedded.tokens * price) / 1_000_000} WHERE id=${runId}`;
    return { ...counts, tokens: embedded.tokens, inputs: missing.length };
  });
}

export async function ingestCorpus(options: IngestOptions): Promise<IngestReport> {
  const { sql, embeddingModel, includeFixtures } = options;
  const contextualEmbedding =
    options.contextualEmbedding ?? getKitConfig().overrides.contextualEmbedding;
  const now = options.now ?? Date.now;
  const started = now();
  const runId = await startRun(sql, options);
  try {
    await options.onRunStarted?.(runId);
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
          ...prepareChunkEmbedding(doc, chunk, contextualEmbedding),
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
    const extra = loaded as IngestDocument[] & {
      discoveredKeys?: string[];
      skippedItems?: { key: string; reason: string }[];
    };
    const keys = [
      ...documents.map((doc) => doc.slug),
      ...(extra.discoveredKeys ?? []),
      ...failedKeys,
      ...(extra.skippedItems ?? []).map((item) => item.key),
    ];
    const done = await prepareItems(sql, runId, keys, extra.skippedItems ?? [], failedKeys);
    const [prior] = await sql`SELECT * FROM ingest_runs WHERE id=${runId}`;
    const report: IngestReport = {
      runId,
      corpusVersion: '',
      sources,
      warnings: loaded.warnings ?? 0,
      documentsTotal: documents.length,
      documentsChanged: Number(prior?.documents_changed ?? 0),
      documentsRemoved: 0,
      chunksTotal: chunks.length,
      chunksInserted: Number(prior?.chunks_inserted ?? 0),
      chunksUpdated: Number(prior?.chunks_updated ?? 0),
      chunksUnchanged: Number(prior?.chunks_unchanged ?? 0),
      chunksDeleted: Number(prior?.chunks_deleted ?? 0),
      embeddingInputs: Number(prior?.chunks_inserted ?? 0),
      embeddingTokens: Number(prior?.embedding_tokens ?? 0),
      costUsdEstimate: Number(prior?.cost_usd_estimate ?? 0),
      includeFixtures,
      durationMs: 0,
    };
    let cursor = 0;
    let failure: Error | undefined;
    const worker = async () => {
      while (!failure && !options.signal?.aborted) {
        const document = documents[cursor++];
        if (!document) return;
        if (done.has(document.slug)) continue;
        try {
          const counts = await upsertDocument(
            sql,
            document,
            known.get(document.slug) ?? new Set(),
            options.provider,
            embeddingModel,
            runId,
            options.pricePerMillion,
          );
          report.documentsChanged += counts.changed;
          report.documentsRemoved += counts.removed;
          report.chunksInserted += counts.inserted;
          report.chunksUpdated += counts.updated;
          report.chunksUnchanged += counts.unchanged;
          report.chunksDeleted += counts.deleted;
          report.embeddingInputs += counts.inputs;
          report.embeddingTokens += counts.tokens;
          report.costUsdEstimate += (counts.tokens * options.pricePerMillion) / 1_000_000;
          done.add(document.slug);
          options.onProgress?.(
            `${String(done.size)}/${String(documents.length)} documents done; ${String(report.chunksInserted)} chunks embedded; ${String(report.embeddingTokens)} tokens; est. $${report.costUsdEstimate.toFixed(4)}`,
          );
          await options.onDocument?.(document.slug);
        } catch (error) {
          failure =
            error instanceof Error ? error : new AppError('INTERNAL_ERROR', 'Ingestion failed.');
          await sql`UPDATE ingest_items SET status='failed',error='Document ingest failed.',updated_at=now() WHERE run_id=${runId} AND document_key=${document.slug} AND status<>'done'`;
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(EMBEDDING.CONCURRENCY, documents.length) }, worker),
    );
    if (options.signal?.aborted) throw new IngestInterrupted();
    if (failure) throw failure;
    const pending =
      await sql`SELECT document_key FROM ingest_items WHERE run_id=${runId} AND status NOT IN ('done','skipped')`;
    if (pending.length && !failedKeys.length)
      throw new AppError(
        'INTERNAL_ERROR',
        'Ingestion has unfinished items. Run sourced ingest to resume.',
      );
    if (failedKeys.length)
      throw new AppError(
        'INTERNAL_ERROR',
        `Ingestion failed for ${String(failedKeys.length)} source items; successful items were kept.`,
      );
    report.corpusVersion = sha256Hex(
      [
        ...hashes,
        ...sources
          .filter((source) => source.revision)
          .map((source) => `${source.id}:${source.revision ?? ''}`),
      ]
        .sort()
        .join('\n'),
    );
    const slugs = [...new Set(keys)];
    const sourceIds = sources.map((source) => source.id);
    const scoped = 'sources' in loaded;
    await sql.begin(async (tx) => {
      const removedChunks = await tx<
        { count: number }[]
      >`SELECT count(*)::int AS count FROM chunks WHERE document_id IN (SELECT id FROM documents WHERE ((NOT ${scoped} OR source_id = ANY(${tx.array(sourceIds, 25)}::text[])) AND NOT (slug = ANY(${tx.array(slugs, 25)}::text[]))) OR (is_fixture AND NOT ${includeFixtures}))`;
      const removedDocuments =
        await tx`DELETE FROM documents WHERE ((NOT ${scoped} OR source_id = ANY(${tx.array(sourceIds, 25)}::text[])) AND NOT (slug = ANY(${tx.array(slugs, 25)}::text[]))) OR (is_fixture AND NOT ${includeFixtures}) RETURNING id`;
      report.documentsRemoved += removedDocuments.length;
      report.chunksDeleted += removedChunks[0]?.count ?? 0;
      if (options.signal?.aborted) throw new IngestInterrupted();
      report.durationMs = now() - started;
      await tx`UPDATE ingest_runs SET status='succeeded',finished_at=now(),corpus_version=${report.corpusVersion},documents_total=${report.documentsTotal},documents_changed=${report.documentsChanged},chunks_inserted=${report.chunksInserted},chunks_updated=${report.chunksUpdated},chunks_unchanged=${report.chunksUnchanged},chunks_deleted=${report.chunksDeleted},embedding_tokens=${report.embeddingTokens},cost_usd_estimate=${report.costUsdEstimate} WHERE id=${runId}`;
    });
    return report;
  } catch (error) {
    const message =
      error instanceof IngestInterrupted
        ? 'interrupted'
        : error instanceof AppError
          ? error.message
          : 'Ingestion failed.';
    await sql`UPDATE ingest_runs SET status='failed',finished_at=now(),error=${message} WHERE id=${runId}`;
    throw error;
  }
}
