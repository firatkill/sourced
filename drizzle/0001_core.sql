CREATE TABLE documents (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug          text        NOT NULL UNIQUE,              -- 'indexes-partial.html'
  url           text        NOT NULL UNIQUE,              -- 'https://www.postgresql.org/docs/17/indexes-partial.html'
  title         text        NOT NULL,                     -- '11.8. Partial Indexes'
  version       text        NOT NULL,                     -- '17'
  section       text        NOT NULL,                     -- manifest group, e.g. 'indexes'
  content_hash  text        NOT NULL,                     -- sha256 hex of raw HTML
  is_fixture    boolean     NOT NULL DEFAULT false,
  fetched_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT documents_content_hash_hex CHECK (content_hash ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint

CREATE TABLE chunks (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id      bigint      NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
  ordinal          integer     NOT NULL CHECK (ordinal >= 0),
  heading_path     text[]      NOT NULL CHECK (cardinality(heading_path) >= 1),
  anchor           text        NOT NULL,                  -- 'indexes-partial.html#INDEXES-PARTIAL'
  content          text        NOT NULL CHECK (length(content) > 0),
  token_count      integer     NOT NULL CHECK (token_count > 0),
  content_hash     text        NOT NULL,
  embedding_model  text        NOT NULL,
  tsv              tsvector    GENERATED ALWAYS AS (to_tsvector('english'::regconfig, content)) STORED,
  embedding        vector(1536) NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chunks_content_hash_key UNIQUE (content_hash),
  CONSTRAINT chunks_document_ordinal_key UNIQUE (document_id, ordinal) DEFERRABLE INITIALLY DEFERRED
);
--> statement-breakpoint

CREATE INDEX chunks_embedding_hnsw_idx
  ON chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
--> statement-breakpoint

CREATE INDEX chunks_tsv_gin_idx ON chunks USING gin (tsv);
--> statement-breakpoint
CREATE INDEX chunks_document_id_idx ON chunks (document_id);
--> statement-breakpoint
CREATE INDEX chunks_anchor_idx ON chunks (anchor);
--> statement-breakpoint

CREATE TABLE ingest_runs (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  started_at          timestamptz NOT NULL DEFAULT now(),
  finished_at         timestamptz,
  status              text        NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  corpus_version      text,                               -- sha256 of sorted chunk content hashes; null until succeeded
  include_fixtures    boolean     NOT NULL,
  embedding_model     text        NOT NULL,
  documents_total     integer     NOT NULL DEFAULT 0,
  documents_changed   integer     NOT NULL DEFAULT 0,
  chunks_inserted     integer     NOT NULL DEFAULT 0,
  chunks_updated      integer     NOT NULL DEFAULT 0,
  chunks_unchanged    integer     NOT NULL DEFAULT 0,
  chunks_deleted      integer     NOT NULL DEFAULT 0,
  embedding_tokens    integer     NOT NULL DEFAULT 0,
  cost_usd_estimate   numeric(10, 6) NOT NULL DEFAULT 0,
  error               text
);
--> statement-breakpoint
CREATE INDEX ingest_runs_finished_idx ON ingest_runs (finished_at DESC) WHERE status = 'succeeded';
