import 'server-only';
import type postgres from 'postgres';
import { createLogger } from '@/lib/logger';
import { AppError } from '@/lib/errors';
import type { KitConfig } from './config-schema';
import { configHash } from './load-config';
import { ftsConfig } from './fts';

export type CorpusSchema = {
  embed_provider: string;
  embed_model: string;
  embed_dimensions: number;
  vector_type: 'vector' | 'halfvec';
  fts_config: string;
  retrieval_hash: string;
};
export function corpusSchema(config: KitConfig): CorpusSchema {
  const embed = config.models.embed;
  const retrieval = {
    embed_provider: embed.provider,
    embed_model: embed.model,
    embed_dimensions: embed.dimensions,
    fts_config: ftsConfig(config.corpus.language),
  };
  return {
    ...retrieval,
    vector_type: embed.dimensions <= 2000 ? 'vector' : 'halfvec',
    retrieval_hash: configHash(retrieval),
  };
}
function mismatch(stored: unknown, configured: CorpusSchema): never {
  createLogger().error({ event: 'corpus.mismatch', stored, configured });
  throw new AppError(
    'CORPUS_MISMATCH',
    `The corpus was indexed with a different embedding model or language. Run ./sourced ingest --rebuild. Stored: ${JSON.stringify(stored)}; configured: ${JSON.stringify(configured)}`,
  );
}
export async function checkCorpusSchema(
  tx: postgres.Sql | postgres.TransactionSql,
  config: KitConfig,
): Promise<{ schema: CorpusSchema; initialized: boolean; empty: boolean }> {
  const configured = corpusSchema(config);
  const [stored] = await tx<
    CorpusSchema[]
  >`SELECT embed_provider, embed_model, embed_dimensions, vector_type, fts_config::text, retrieval_hash FROM corpus_meta WHERE id=1`;
  if (stored) {
    if (stored.retrieval_hash !== configured.retrieval_hash) mismatch(stored, configured);
    return { schema: stored, initialized: true, empty: false };
  }
  const [count] = await tx<{ present: boolean }[]>`SELECT EXISTS (SELECT 1 FROM chunks) AS present`;
  if (!count?.present) return { schema: configured, initialized: false, empty: true };
  const columns = await tx<{ attname: string; type: string; expression: string | null }[]>`
    SELECT a.attname, format_type(a.atttypid, a.atttypmod) AS type,
      pg_get_expr(d.adbin,d.adrelid) AS expression
    FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid='chunks'::regclass AND a.attname IN ('embedding','tsv') AND NOT a.attisdropped`;
  const models = await tx<
    { embedding_model: string }[]
  >`SELECT DISTINCT embedding_model FROM chunks`;
  const type = columns.find((c) => c.attname === 'embedding')?.type;
  const expression = columns.find((c) => c.attname === 'tsv')?.expression;
  const regconfig = /to_tsvector\('([^']+)'::regconfig, content\)/.exec(expression ?? '')?.[1];
  if (
    type !== `${configured.vector_type}(${String(configured.embed_dimensions)})` ||
    regconfig !== configured.fts_config ||
    models.length !== 1 ||
    models[0]?.embedding_model !== configured.embed_model
  )
    mismatch({ type, expression, models }, configured);
  return { schema: configured, initialized: false, empty: false };
}

/** Mutations are ingest-only; app/search call checkCorpusSchema instead. */
export async function ensureCorpusSchema(
  sql: postgres.Sql,
  config: KitConfig,
  options: { rebuild?: boolean; confirmed?: boolean } = {},
): Promise<CorpusSchema> {
  return sql.begin(async (tx) => {
    await tx`LOCK TABLE corpus_meta, documents, chunks IN ACCESS EXCLUSIVE MODE`;
    if (options.rebuild) {
      if (!options.confirmed)
        throw new AppError(
          'CONFIG_INVALID',
          'rebuild: Confirm with --yes before rebuilding the corpus.',
        );
      await tx`TRUNCATE chunks, documents CASCADE`;
      await tx`DELETE FROM corpus_meta`;
    }
    // D-120: init may reserve a model before the first ingest. Nothing indexed
    // means there is no embedding data to protect; retain documents and reconfigure.
    const configured = corpusSchema(config);
    await tx`DELETE FROM corpus_meta WHERE retrieval_hash <> ${configured.retrieval_hash}
      AND NOT EXISTS (SELECT 1 FROM chunks)`;
    const state = await checkCorpusSchema(tx, config);
    if (state.initialized) return state.schema;
    const schema = state.schema;
    if (state.empty) {
      // DDL grammar cannot bind typmods or generated expressions. Bind values into
      // transaction-local settings and quote them with format inside a constant DO.
      await tx`SELECT set_config('sourced.vector_type', ${schema.vector_type}, true),
        set_config('sourced.dimensions', ${String(schema.embed_dimensions)}, true),
        set_config('sourced.fts_config', ${schema.fts_config}, true)`;
      await tx`DO $ddl$
      DECLARE vtype text := current_setting('sourced.vector_type');
              dims integer := current_setting('sourced.dimensions')::integer;
              fts regconfig := current_setting('sourced.fts_config')::regconfig;
      BEGIN
        DROP INDEX IF EXISTS chunks_embedding_hnsw_idx;
        EXECUTE format('ALTER TABLE chunks ALTER COLUMN embedding TYPE %I(%s) USING embedding::%I(%s)', vtype, dims, vtype, dims);
        EXECUTE format('CREATE INDEX chunks_embedding_hnsw_idx ON chunks USING hnsw (embedding %I) WITH (m=16, ef_construction=64)', vtype || '_cosine_ops');
        ALTER TABLE chunks DROP COLUMN tsv;
        EXECUTE format('ALTER TABLE chunks ADD COLUMN tsv tsvector GENERATED ALWAYS AS (to_tsvector(%L::regconfig, content)) STORED', fts::text);
        CREATE INDEX chunks_tsv_gin_idx ON chunks USING gin(tsv);
      END $ddl$`;
    }
    await tx`INSERT INTO corpus_meta (corpus_name, embed_provider, embed_model, embed_dimensions, vector_type, fts_config, retrieval_hash, documents_total)
      VALUES (${config.corpus.name}, ${schema.embed_provider}, ${schema.embed_model}, ${schema.embed_dimensions}, ${schema.vector_type}, ${schema.fts_config}::regconfig, ${schema.retrieval_hash}, (SELECT count(*) FROM documents))`;
    return schema;
  });
}

let startupCheck: ReturnType<typeof checkCorpusSchema> | undefined;
/** The app restarts to pick up a new snapshot; startup validation is process-local. */
export function checkAppCorpusSchema(
  sql: postgres.Sql,
  config: KitConfig,
): ReturnType<typeof checkCorpusSchema> {
  startupCheck ??= checkCorpusSchema(sql, config);
  return startupCheck;
}
