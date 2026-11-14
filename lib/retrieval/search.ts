import type postgres from 'postgres';
import { AppError } from '@/lib/errors';
import { RETRIEVAL } from '@/lib/config';
import { getKitConfig } from '@/lib/kit/runtime-config';
import { checkCorpusSchema, type CorpusSchema } from '@/lib/kit/vector-schema';
import { getSql } from '@/lib/db/client';
import type { RetrievedChunk } from './types';

type SearchLimits = { vectorCandidates?: number; ftsCandidates?: number; limit?: number };
type SearchResult = {
  chunks: RetrievedChunk[];
  vectorCandidates: number;
  ftsCandidates: number;
};
type SearchRow = {
  chunk_id: string;
  rrf_score: number;
  vector_rank: number | null;
  fts_rank: number | null;
  vector_distance: number | null;
  fts_score: number | null;
  heading_path: string[];
  anchor: string;
  content: string;
  token_count: number;
  document_title: string;
  document_url: string;
  source_kind: 'web' | 'file' | null;
  mime_type: string | null;
  page_from: number | null;
  page_to: number | null;
  slug: string;
};

export async function searchInTransaction(
  tx: postgres.TransactionSql,
  vector: number[],
  question: string,
  limits: SearchLimits = {},
  schema?: CorpusSchema,
): Promise<SearchResult> {
  const active = schema ?? (await checkCorpusSchema(tx, getKitConfig())).schema;
  await tx.unsafe(`SET LOCAL hnsw.ef_search = ${String(RETRIEVAL.HNSW_EF_SEARCH)}`);
  const rows = await tx<SearchRow[]>`WITH vector_hits AS (
  SELECT v.id,
         v.distance,
         ROW_NUMBER() OVER (ORDER BY v.distance ASC, v.id ASC) AS rank
  FROM (
    SELECT c.id,
           c.embedding <=> ${JSON.stringify(vector)}::${tx(active.vector_type)} AS distance
    FROM chunks c
    ORDER BY c.embedding <=> ${JSON.stringify(vector)}::${tx(active.vector_type)}
    LIMIT ${limits.vectorCandidates ?? RETRIEVAL.VECTOR_CANDIDATES}::int
  ) AS v
),
fts_hits AS (
  SELECT f.id,
         f.score,
         ROW_NUMBER() OVER (ORDER BY f.score DESC, f.id ASC) AS rank
  FROM (
    SELECT c.id,
           ts_rank_cd(c.tsv, q.query, 32) AS score
    FROM chunks c,
         websearch_to_tsquery(${active.fts_config}::regconfig, ${question}::text) AS q(query)
    WHERE c.tsv @@ q.query
    ORDER BY score DESC, c.id ASC
    LIMIT ${limits.ftsCandidates ?? RETRIEVAL.FTS_CANDIDATES}::int
  ) AS f
),
fused AS (
  SELECT COALESCE(v.id, f.id)                         AS id,
         v.rank                                       AS vector_rank,
         f.rank                                       AS fts_rank,
         v.distance                                   AS vector_distance,
         f.score                                      AS fts_score,
         COALESCE(1.0 / (${RETRIEVAL.RRF_K}::int + v.rank), 0.0)
       + COALESCE(1.0 / (${RETRIEVAL.RRF_K}::int + f.rank), 0.0)      AS rrf_score
  FROM vector_hits v
  FULL OUTER JOIN fts_hits f ON f.id = v.id
)
SELECT fu.id::text                 AS chunk_id,
       fu.rrf_score::float8        AS rrf_score,
       fu.vector_rank::int         AS vector_rank,
       fu.fts_rank::int            AS fts_rank,
       fu.vector_distance::float8  AS vector_distance,
       fu.fts_score::float8        AS fts_score,
       c.heading_path,
       c.anchor,
       c.content,
       c.token_count,
       d.mime_type,
       c.page_from,
       c.page_to,
       d.title                     AS document_title,
       d.url                       AS document_url,
       d.slug,
       d.source_kind
FROM fused fu
JOIN chunks c    ON c.id = fu.id
JOIN documents d ON d.id = c.document_id
ORDER BY fu.rrf_score DESC,
         LEAST(COALESCE(fu.vector_rank, 2147483647), COALESCE(fu.fts_rank, 2147483647)) ASC,
         fu.id ASC
LIMIT ${limits.limit ?? RETRIEVAL.RERANK_CANDIDATES}::int;`;
  const [vectorCount] = await tx<{ count: number }[]>`
    SELECT LEAST(${limits.vectorCandidates ?? RETRIEVAL.VECTOR_CANDIDATES}::int,
      (SELECT count(*) FROM chunks))::int AS count`;
  const [ftsCount] = await tx<{ count: number }[]>`
    SELECT count(*)::int AS count FROM (
      SELECT 1 FROM chunks c
      WHERE c.tsv @@ websearch_to_tsquery(${active.fts_config}::regconfig, ${question}::text)
      LIMIT ${limits.ftsCandidates ?? RETRIEVAL.FTS_CANDIDATES}::int
    ) AS fts_candidates`;
  return {
    vectorCandidates: vectorCount?.count ?? 0,
    ftsCandidates: ftsCount?.count ?? 0,
    chunks: rows.map((row) => ({
      chunkId: row.chunk_id,
      rrfScore: row.rrf_score,
      vectorRank: row.vector_rank,
      ftsRank: row.fts_rank,
      vectorDistance: row.vector_distance,
      ftsScore: row.fts_score,
      headingPath: row.heading_path,
      anchor: row.anchor,
      content: row.content,
      tokenCount: row.token_count,
      ...(row.mime_type === 'text/plain' && /#l[1-9]\d*$/.test(row.anchor)
        ? { lineFrom: Number(row.anchor.split('#l')[1]) }
        : {}),
      ...(row.page_from != null ? { pageFrom: row.page_from } : {}),
      ...(row.page_to != null ? { pageTo: row.page_to } : {}),
      documentTitle: row.document_title,
      documentUrl: row.document_url,
      sourceKind: row.source_kind ?? 'web',
      slug: row.slug,
    })),
  };
}

export async function search(
  vector: number[],
  question: string,
  limits: SearchLimits = {},
): Promise<SearchResult> {
  return getSql().begin(async (tx) => {
    const state = await checkCorpusSchema(tx, getKitConfig());
    const [row] = await tx<{ present: boolean }[]>`SELECT EXISTS (SELECT 1 FROM chunks) AS present`;
    if (!row?.present)
      throw new AppError('CORPUS_EMPTY', 'Nothing is indexed yet. Run ./sourced ingest.');
    return searchInTransaction(tx, vector, question, limits, state.schema);
  });
}
