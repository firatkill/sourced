CREATE TABLE corpus_meta (
  id                 smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),     -- one corpus per database
  corpus_name        text        NOT NULL,
  embed_provider     text        NOT NULL,
  embed_model        text        NOT NULL,
  embed_dimensions   integer     NOT NULL CHECK (embed_dimensions > 0),
  vector_type        text        NOT NULL CHECK (vector_type IN ('vector', 'halfvec')),
  fts_config         regconfig   NOT NULL,
  retrieval_hash     text        NOT NULL,          -- sha256 of embed provider, model, dimensions, fts_config
  documents_total    integer     NOT NULL DEFAULT 0,
  updated_at         timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

ALTER TABLE documents ADD COLUMN source_id   text;      -- null only for rows written by v1
--> statement-breakpoint
ALTER TABLE documents ADD COLUMN source_kind text;      -- 'web' | 'file'
--> statement-breakpoint
ALTER TABLE documents ADD COLUMN mime_type   text;
--> statement-breakpoint
ALTER TABLE chunks    ADD COLUMN page_from   integer;   -- PDF only
--> statement-breakpoint
ALTER TABLE chunks    ADD COLUMN page_to     integer;
--> statement-breakpoint
ALTER TABLE chunks    ADD COLUMN embed_text_version smallint NOT NULL DEFAULT 0;   -- 0 = v1 (content only), 1 = contextual (FR-75)
--> statement-breakpoint

ALTER TABLE chunks DROP CONSTRAINT chunks_content_hash_key;
--> statement-breakpoint
ALTER TABLE chunks ADD CONSTRAINT chunks_document_content_hash_key UNIQUE (document_id, content_hash);
--> statement-breakpoint

CREATE TABLE ingest_items (
  run_id        bigint  NOT NULL REFERENCES ingest_runs (id) ON DELETE CASCADE,
  document_key  text    NOT NULL,                 -- '<source_id>:<normalized path or URL>'
  status        text    NOT NULL CHECK (status IN ('pending', 'done', 'failed', 'skipped')),
  chunks        integer NOT NULL DEFAULT 0,
  tokens        integer NOT NULL DEFAULT 0,
  error         text,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, document_key)
);
--> statement-breakpoint
ALTER TABLE ingest_runs ADD COLUMN config_hash text;
--> statement-breakpoint

ALTER TABLE query_log DROP CONSTRAINT query_log_source_check;
--> statement-breakpoint
ALTER TABLE query_log ADD CONSTRAINT query_log_source_check CHECK (source IN ('live', 'cache', 'cli'));
--> statement-breakpoint
