CREATE TABLE answer_cache (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cache_key       text        NOT NULL UNIQUE,            -- sha256(suggested_id|corpus_version|prompt_version|chat_model)
  suggested_id    text        NOT NULL,
  question        text        NOT NULL,                   -- canonical public suggested question text
  corpus_version  text        NOT NULL,
  prompt_version  text        NOT NULL,
  chat_model      text        NOT NULL,
  payload         jsonb       NOT NULL,                   -- CachedAnswerPayload (section 16.3)
  created_at      timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX answer_cache_suggested_idx ON answer_cache (suggested_id, created_at DESC);
--> statement-breakpoint

CREATE TABLE rate_limits (
  bucket        text        NOT NULL,                     -- 'global' or 'ip:<hmac hex>'
  window_start  date        NOT NULL,                     -- UTC date
  count         integer     NOT NULL CHECK (count >= 0),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bucket, window_start)
);
--> statement-breakpoint
CREATE INDEX rate_limits_window_idx ON rate_limits (window_start);
--> statement-breakpoint

CREATE TABLE query_log (
  id                       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id               uuid        NOT NULL UNIQUE,
  created_at               timestamptz NOT NULL DEFAULT now(),
  source                   text        NOT NULL CHECK (source IN ('live', 'cache')),
  outcome                  text        NOT NULL CHECK (outcome IN ('answered', 'not_found', 'rate_limited', 'aborted', 'error')),
  error_code               text,
  question_hash            text        NOT NULL,          -- hmac-sha256(QUESTION_HASH_SALT, normalized question)
  question_length          integer     NOT NULL CHECK (question_length >= 0),
  question_text            text,                          -- only when STORE_QUESTIONS=true
  suggested_id             text,
  chat_model               text,
  embedding_model          text,
  prompt_version           text,
  corpus_version           text,
  passages_count           smallint,
  rerank_fallback          boolean,
  quote_fallback_used      boolean,
  citations_valid          smallint,
  citations_invalid        smallint,
  latency_total_ms         integer,
  latency_first_token_ms   integer,
  latency_embed_ms         integer,
  latency_search_ms        integer,
  latency_rerank_ms        integer,
  latency_generation_ms    integer,
  tokens_embedding         integer,
  tokens_input             integer,
  tokens_output            integer,
  cost_usd_estimate        numeric(10, 6)
);
--> statement-breakpoint
CREATE INDEX query_log_created_at_idx ON query_log (created_at DESC);
