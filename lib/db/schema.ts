import 'server-only';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  customType,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  vector,
} from 'drizzle-orm/pg-core';
import { EMBEDDING } from '@/lib/config';

const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' });

export const documents = pgTable(
  'documents',
  {
    id: bigint('id', { mode: 'bigint' }).generatedAlwaysAsIdentity().primaryKey(),
    slug: text('slug').notNull().unique('documents_slug_key'),
    url: text('url').notNull().unique('documents_url_key'),
    title: text('title').notNull(),
    version: text('version').notNull(),
    section: text('section').notNull(),
    contentHash: text('content_hash').notNull(),
    isFixture: boolean('is_fixture').notNull().default(false),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('documents_content_hash_hex', sql`${t.contentHash} ~ '^[0-9a-f]{64}$'`)],
);

export const chunks = pgTable(
  'chunks',
  {
    id: bigint('id', { mode: 'bigint' }).generatedAlwaysAsIdentity().primaryKey(),
    documentId: bigint('document_id', { mode: 'bigint' })
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    ordinal: integer('ordinal').notNull(),
    headingPath: text('heading_path').array().notNull(),
    anchor: text('anchor').notNull(),
    content: text('content').notNull(),
    tokenCount: integer('token_count').notNull(),
    contentHash: text('content_hash').notNull(),
    embeddingModel: text('embedding_model').notNull(),
    tsv: tsvector('tsv').generatedAlwaysAs(sql`to_tsvector('english'::regconfig, content)`),
    embedding: vector('embedding', { dimensions: EMBEDDING.DIMENSIONS }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('chunks_content_hash_key').on(t.contentHash),
    // Drizzle cannot express deferral: 0001_core.sql adds DEFERRABLE INITIALLY DEFERRED.
    unique('chunks_document_ordinal_key').on(t.documentId, t.ordinal),
    check('chunks_ordinal_check', sql`${t.ordinal} >= 0`),
    check('chunks_heading_path_check', sql`cardinality(${t.headingPath}) >= 1`),
    check('chunks_content_check', sql`length(${t.content}) > 0`),
    check('chunks_token_count_check', sql`${t.tokenCount} > 0`),
    index('chunks_embedding_hnsw_idx')
      .using('hnsw', t.embedding.op('vector_cosine_ops'))
      .with({ m: 16, ef_construction: 64 }),
    index('chunks_tsv_gin_idx').using('gin', t.tsv),
    index('chunks_document_id_idx').on(t.documentId),
    index('chunks_anchor_idx').on(t.anchor),
  ],
);

export const ingestRuns = pgTable(
  'ingest_runs',
  {
    id: bigint('id', { mode: 'bigint' }).generatedAlwaysAsIdentity().primaryKey(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    status: text('status').notNull(),
    corpusVersion: text('corpus_version'),
    includeFixtures: boolean('include_fixtures').notNull(),
    embeddingModel: text('embedding_model').notNull(),
    documentsTotal: integer('documents_total').notNull().default(0),
    documentsChanged: integer('documents_changed').notNull().default(0),
    chunksInserted: integer('chunks_inserted').notNull().default(0),
    chunksUpdated: integer('chunks_updated').notNull().default(0),
    chunksUnchanged: integer('chunks_unchanged').notNull().default(0),
    chunksDeleted: integer('chunks_deleted').notNull().default(0),
    embeddingTokens: integer('embedding_tokens').notNull().default(0),
    costUsdEstimate: numeric('cost_usd_estimate', { precision: 10, scale: 6 })
      .notNull()
      .default('0'),
    error: text('error'),
  },
  (t) => [
    check('ingest_runs_status_check', sql`${t.status} IN ('running', 'succeeded', 'failed')`),
    index('ingest_runs_finished_idx')
      .on(t.finishedAt.desc().nullsFirst())
      .where(sql`${t.status} = 'succeeded'`),
  ],
);
