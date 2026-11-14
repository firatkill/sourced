/** T-63 / NFR-21. Run with LLM_MODE=mock and DATABASE_URL pointing to local
 * sourced_bench and DATABASE_POOL_MAX=1: pnpm exec tsx --conditions=react-server --env-file-if-exists=.env.local
 * scripts/bench-search.ts [--regenerate]. Never included in CI.
 */
import { execFileSync } from 'node:child_process';
import { z } from 'zod';
import { parseHtml } from '@/lib/ingest/parse-html';
import { chunkDocument, type Chunk } from '@/lib/ingest/chunk';
import { parseGolden } from '@/lib/eval/golden';
import exampleConfig from '../sourced.config';
import { rawFilename } from '@/lib/sources/urls';
import { cpus, freemem, loadavg, platform, release, totalmem } from 'node:os';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { getEnv } from '@/lib/env';
import { EMBEDDING, RETRIEVAL } from '@/lib/config';
import { getSql, closeSqlForTests } from '@/lib/db/client';
import { KitConfigSchema } from '@/lib/kit/config-schema';
import { setCliKitConfig } from '@/lib/kit/runtime-config';
import { ensureCorpusSchema } from '@/lib/kit/vector-schema';
import { featureHash } from '@/lib/llm/feature-hash';
import { sha256Hex } from '@/lib/hash';
import { search } from '@/lib/retrieval/search';

const documents = 5_000;
const chunksPerDocument = 20;
const totalChunks = documents * chunksPerDocument;
const topics = [
  'transaction isolation',
  'partial index',
  'foreign key',
  'json operator',
  'query planner',
  'vacuum maintenance',
  'table partition',
  'logical replication',
  'backup recovery',
  'connection pooling',
  'row security',
  'window function',
  'aggregate query',
  'text search',
  'array type',
  'timestamp conversion',
  'unique constraint',
  'trigger function',
  'recursive query',
  'materialized view',
];
const actions = [
  'configure',
  'create',
  'inspect',
  'optimize',
  'monitor',
  'restore',
  'validate',
  'update',
  'remove',
  'compare',
];
export const benchQueries = topics.flatMap((topic, i) =>
  actions.map((action, j) => {
    const forms = [
      `How to ${action} ${topic}?`,
      `${topic} performance`,
      `"${topic}"`,
      `${topic} OR ${topics[(i + 1) % topics.length] ?? 'index'}`,
      `${topic} -error`,
      `${action} ${topic} workload`,
      `tenant${String(i * 10 + j)} ${topic}`,
      `${topic} configuration example`,
      `${topic} failure recovery`,
      `${action} missingdocumentation${String(i)}`,
    ];
    return forms[j] ?? topic;
  }),
);
export function benchTarget(value: string): URL {
  const url = new URL(value);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.pathname !== '/sourced_bench' ||
    url.search ||
    url.hash
  )
    throw new Error(
      'Benchmark requires a localhost DATABASE_URL named sourced_bench with no URL options.',
    );
  return url;
}
export function percentile(values: number[], fraction: number): number {
  if (!values.length || fraction <= 0 || fraction > 1) throw new Error('Invalid percentile input.');
  const sorted = [...values].sort((a, b) => a - b);
  const value = sorted[Math.ceil(sorted.length * fraction) - 1];
  if (value === undefined) throw new Error('Missing percentile.');
  return Math.round(value * 1000) / 1000;
}
export function benchText(index: number): string {
  const topic = topics[Math.floor(index / chunksPerDocument) % topics.length] ?? 'transaction';
  const paragraphs = Array.from({ length: 5 + (index % 8) }, (_, n) => {
    const related = topics[(index * 7 + n * 3) % topics.length] ?? topic;
    return (
      `To ${actions[(index + n) % actions.length] ?? 'configure'} ${topic}, review the ${related} settings for tenant${String(index % 997)}. ` +
      `The database stores records in relation${String((index * 31 + n) % 4093)} and checks each operation before committing changes. ` +
      `Use a separate session to measure response time, examine the execution plan, and verify that concurrent requests preserve consistent results for workload${String((index + n * 17) % 503)}.`
    );
  });
  return `Section ${String(index)}: ${topic}.\n\n${paragraphs.join('\n\n')}`;
}
// Read Git objects, not a potentially modified/untracked working corpus.
function committed(path: string): string {
  return execFileSync('git', ['show', `HEAD:${path}`], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
}
export function realisticMaterial() {
  const chunks: Chunk[] = [];
  const files: { path: string; sha256: string }[] = [];
  for (const source of KitConfigSchema.parse(exampleConfig).sources) {
    if (source.type !== 'urls') continue;
    for (const url of source.urls) {
      const path = `corpus/postgres-17/raw/${source.id}/${rawFilename(url)}`;
      const html = committed(path);
      const slug = new URL(url).pathname.split('/').at(-1);
      if (!slug || !source.html.contentSelector)
        throw new Error('Missing example parser metadata.');
      files.push({ path, sha256: sha256Hex(html) });
      chunks.push(
        ...chunkDocument(
          parseHtml(html, {
            slug,
            section: source.group ?? source.id,
            html: { ...source.html, contentSelector: source.html.contentSelector },
          }),
          slug,
        ),
      );
    }
  }
  if (!chunks.length) throw new Error('Empty example corpus.');
  return { chunks, files, fingerprint: sha256Hex(JSON.stringify(chunks)) };
}
// Use the example's configured display name, without its documentation suffix.
const corpusSubject = KitConfigSchema.parse(exampleConfig).corpus.title.replace(/\s+docs$/, '');
// Written before measurement, without selecting terms by observed match counts.
const paraphrases: Record<string, string> = {
  q001: 'Which serialization anomaly is allowed by repeatable read but ruled out by serializable isolation?',
  q002: 'Under what circumstances should I index only a subset of the rows in a table?',
  q003: 'How does running EXPLAIN with ANALYZE expand the information in an execution plan?',
  q004: 'How should I choose between storing JSON as json or as jsonb?',
  q005: 'What access does an ordinary user have to a table with row security enabled and no policies defined?',
  q006: 'How does vacuuming protect a table against transaction ID wraparound?',
  q009: 'Which of hash and B-tree indexes supports range predicates?',
  q010: 'Why is a predicate on the trailing column of a multicolumn index often inefficient?',
  q011: 'How can an index satisfy ORDER BY with LIMIT 10 without sorting every row?',
  q012: 'How does an index on lower(column) help case-insensitive comparisons, and how does it affect updates?',
  q013: 'When does an index-only scan still need to fetch rows from the heap?',
  q014: 'How are null values treated by a unique constraint with NULLS NOT DISTINCT?',
  q015: 'Which isolation level prevents successive queries within a transaction from seeing different committed data?',
  q016: 'Are ordinary SELECT queries blocked by a row lock taken with SELECT FOR UPDATE?',
  q017: `How does ${corpusSubject} handle a circular wait between transactions?`,
  q018: 'Does a session advisory lock survive transaction rollback?',
  q019: 'At what stage of an initial bulk load should indexes be created and ANALYZE run?',
  q020: 'Why can correlated column values cause inaccurate planner row estimates?',
  q021: 'Why is the duration reported by EXPLAIN ANALYZE different from end-to-end client latency?',
  q022: 'What makes COPY more efficient than individual INSERT statements for loading many rows?',
  q023: 'How do document tsvectors and queries produced by websearch_to_tsquery work together?',
  q024: 'Why is an explicit text search configuration necessary for an index expression using to_tsvector?',
  q025: 'What advantages does a GIN index have over GiST for full-text retrieval?',
  q026: 'How can matching passages in a search result be highlighted with ts_headline?',
  q027: 'Can a jsonb_path_ops index handle key-existence tests, and which operators can use it?',
  q028: 'Does jsonb array containment depend on element order or duplicate elements?',
  q029: 'Why does DELETE leave disk space allocated, and what returns it to the operating system?',
  q030: 'What is the difference between vacuuming and rebuilding a bloated index?',
  q031: 'Which backup utility saves cluster-wide roles and tablespaces that pg_dump omits?',
  q032: 'Which tools restore SQL-format dumps and custom-format pg_dump archives?',
  q033: 'Is a file-system copy of a running database a valid backup without a consistent snapshot?',
  q034: 'In an UPDATE row-security policy, which rows are checked by USING and which by WITH CHECK?',
};
export function realisticQueries(text: string) {
  const parsed = parseGolden(text);
  if (parsed.errors.length) throw new Error('Invalid committed golden set.');
  return parsed.entries
    .filter((entry) => entry.type === 'answerable')
    .flatMap((entry) => {
      const paraphrase = paraphrases[entry.id];
      if (!paraphrase) throw new Error('Add a reviewed paraphrase for the new golden question.');
      return [
        entry.question,
        paraphrase,
        `In ${corpusSubject}, ${entry.question}`,
        `Explain the following: ${paraphrase}`,
        `Please clarify: ${entry.question}`,
        `Using the ${corpusSubject} documentation, answer this: ${paraphrase}`,
        `For a database administrator: ${paraphrase}`,
      ].map((question, variant) => ({ id: `${entry.id}-${String(variant)}`, question }));
    });
}
export function realisticChunk(chunks: Chunk[], index: number): Chunk {
  const chunk = chunks[index % chunks.length];
  if (!chunk) throw new Error('Empty example chunks.');
  return chunk;
}
// Rebind the exact SQL observed by postgres.js; values never become SQL text.
// This lets EXPLAIN follow search() without maintaining a second search query.
export function explainTemplate(query: string, parameters: readonly (string | number)[]) {
  const values: (string | number)[] = [];
  const parts = query.split(/(\$\d+)/);
  const strings = ['EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '];
  for (const part of parts) {
    if (/^\$\d+$/.test(part)) {
      const value = parameters[Number(part.slice(1)) - 1];
      if (value === undefined) throw new Error('Missing SQL parameter.');
      values.push(value);
      strings.push('');
    } else strings[strings.length - 1] = (strings[strings.length - 1] ?? '') + part;
  }
  return { strings: Object.assign(strings, { raw: [...strings] }), values };
}
type PlanNode = {
  'Node Type': string;
  'Actual Total Time': number;
  'Actual Loops': number;
  Alias?: string;
  Plans?: PlanNode[];
};
export function explainTimings(explain: unknown) {
  const node: z.ZodType<PlanNode> = z.lazy(
    () =>
      z.object({
        'Node Type': z.string(),
        'Actual Total Time': z.number(),
        'Actual Loops': z.number(),
        Alias: z.string().optional(),
        Plans: z.array(node).optional(),
      }) as z.ZodType<PlanNode>,
  );
  const [root] = z.array(z.object({ Plan: node, 'Execution Time': z.number() })).parse(explain);
  if (!root) throw new Error('Missing EXPLAIN plan.');
  const contains = (plan: PlanNode, alias: string): boolean =>
    plan.Alias === alias || (plan.Plans ?? []).some((child) => contains(child, alias));
  const find = (plan: PlanNode, alias: string): number | undefined => {
    if (plan['Node Type'] === 'WindowAgg' && contains(plan, alias))
      return plan['Actual Total Time'] * plan['Actual Loops'];
    for (const child of plan.Plans ?? []) {
      const value = find(child, alias);
      if (value !== undefined) return value;
    }
    return undefined;
  };
  // The FTS WindowAgg is inside alias f, so use its complete Subquery Scan.
  const fts = (plan: PlanNode): number | undefined => {
    if (plan.Alias === 'f') return plan['Actual Total Time'] * plan['Actual Loops'];
    for (const child of plan.Plans ?? []) {
      const value = fts(child);
      if (value !== undefined) return value;
    }
    return undefined;
  };
  return {
    executionMs: root['Execution Time'],
    vectorCteMs: find(root.Plan, 'v') ?? null,
    ftsCteMs: fts(root.Plan) ?? null,
  };
}
async function explainSearch(sql: postgres.Sql, vector: number[], question: string) {
  let captured: ReturnType<typeof explainTemplate> | undefined;
  const previous = sql.options.debug;
  sql.options.debug = (_connection, query, parameters: unknown[]) => {
    if (query.startsWith('WITH vector_hits AS')) {
      const bound = z.array(z.union([z.string(), z.number()])).parse(parameters);
      captured = explainTemplate(query, bound);
    }
  };
  try {
    await search(vector, question);
  } finally {
    sql.options.debug = previous;
  }
  if (!captured) throw new Error('Search SQL was not captured.');
  const statement = captured;
  return sql.begin(async (tx) => {
    await tx`SELECT set_config('hnsw.ef_search', ${String(RETRIEVAL.HNSW_EF_SEARCH)}, true)`;
    const rows = await tx(statement.strings, ...statement.values);
    const plan: unknown = rows[0]?.['QUERY PLAN'];
    return { timings: explainTimings(plan), plan };
  });
}
const progress = (event: string, extra = {}) => {
  console.error(JSON.stringify({ event, ...extra }));
};
async function main() {
  const { values } = parseArgs({
    options: { regenerate: { type: 'boolean', default: false } },
    strict: true,
  });
  const config = KitConfigSchema.parse({
    corpus: {
      name: 'sourced-bench',
      title: 'Synthetic search benchmark',
      description: 'T-63 synthetic corpus',
      language: 'en',
    },
    schemaVersion: 1,
    profile: 'local',
    models: {
      chat: { provider: 'mock', model: 'mock' },
      embed: { provider: 'mock', model: EMBEDDING.MOCK_MODEL, dimensions: EMBEDDING.DIMENSIONS },
    },
  });
  setCliKitConfig(config);
  const env = getEnv();
  if (env.LLM_MODE !== 'mock') throw new Error('Benchmark requires LLM_MODE=mock.');
  const target = benchTarget(env.DATABASE_URL);
  if (env.DATABASE_POOL_MAX !== 1)
    throw new Error('Benchmark requires DATABASE_POOL_MAX=1 for session isolation.');
  const material = realisticMaterial();
  const goldenText = committed('eval/postgres-17/golden.jsonl');
  const profiles: Record<string, unknown> = {};
  const before = loadavg();
  const adminUrl = new URL(target);
  adminUrl.pathname = '/postgres';
  const admin = postgres(adminUrl.href, { max: 1, prepare: false });
  let locked = false;
  try {
    const [lock] = await admin<
      { locked: boolean }[]
    >`SELECT pg_try_advisory_lock(636363) AS locked`;
    if (!lock?.locked) throw new Error('Another benchmark is already running.');
    locked = true;
    const exists = await admin`SELECT 1 FROM pg_database WHERE datname='sourced_bench'`;
    if (!exists.length) await admin`CREATE DATABASE sourced_bench`;
    const sql = getSql();
    await sql`SET client_min_messages TO warning`;
    await migrate(drizzle(sql), {
      migrationsFolder: new URL('../drizzle', import.meta.url).pathname,
    });
    await sql`CREATE SCHEMA IF NOT EXISTS bench_realistic`;
    await sql`CREATE TABLE IF NOT EXISTS bench_realistic.documents (LIKE public.documents INCLUDING ALL)`;
    await sql`CREATE TABLE IF NOT EXISTS bench_realistic.chunks (LIKE public.chunks INCLUDING ALL)`;
    await sql`CREATE TABLE IF NOT EXISTS bench_realistic.corpus_meta (LIKE public.corpus_meta INCLUDING ALL)`;
    // LIKE copies the existing index definitions; normalize only their names.
    const copiedIndexes = await sql<
      { indexname: string; indexdef: string }[]
    >`SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='bench_realistic' AND tablename='chunks'`;
    for (const index of copiedIndexes) {
      const name = index.indexdef.includes(' USING hnsw ')
        ? 'chunks_embedding_hnsw_idx'
        : index.indexdef.includes(' USING gin ')
          ? 'chunks_tsv_gin_idx'
          : undefined;
      if (name && index.indexname !== name)
        await sql`ALTER INDEX ${sql(`bench_realistic.${index.indexname}`)} RENAME TO ${sql(name)}`;
    }
    for (const profile of ['realistic', 'worstCase'] as const) {
      const schema = profile === 'realistic' ? 'bench_realistic' : 'public';
      await sql`SELECT set_config('search_path', ${`${schema},public`}, false)`;
      const generator =
        profile === 'realistic' ? `realistic-v2:${material.fingerprint}` : 'synthetic-v1';
      const [count] = await sql<{ chunks: number; documents: number }[]>`SELECT
      (SELECT count(*)::int FROM chunks) AS chunks, (SELECT count(*)::int FROM documents) AS documents`;
      const versions = await sql<{ version: string }[]>`SELECT DISTINCT version FROM documents`;
      const reused =
        !values.regenerate &&
        count?.chunks === totalChunks &&
        count.documents === documents &&
        versions.length === 1 &&
        versions[0]?.version === generator;
      if (!reused) {
        if (!values.regenerate && (count?.chunks || count?.documents))
          throw new Error(
            'Incomplete benchmark corpus. Rerun with --regenerate to replace only sourced_bench data.',
          );
        await ensureCorpusSchema(sql, config, { rebuild: true, confirmed: true });
        await sql`DROP INDEX IF EXISTS chunks_embedding_hnsw_idx`;
        await sql`DROP INDEX IF EXISTS chunks_tsv_gin_idx`;
        progress('generation.start', { profile, documents, chunks: totalChunks });
        for (let start = 0; start < documents; start += 50) {
          await sql.begin(async (tx) => {
            for (let d = start; d < start + 50; d++) {
              const slug = `bench:document-${String(d)}`;
              const [document] = await tx<{ id: string }[]>`INSERT INTO documents
              (slug, url, title, version, section, content_hash, fetched_at, source_id, source_kind)
              VALUES (${slug}, ${`https://bench.invalid/${String(d)}`}, ${`Document ${String(d)}`}, ${generator}, 'bench', ${sha256Hex(slug)}, now(), 'bench', 'web') RETURNING id::text`;
              if (!document) throw new Error('Document insertion failed.');
              const rows = Array.from({ length: chunksPerDocument }, (_, ordinal) => {
                const original =
                  profile === 'realistic'
                    ? realisticChunk(material.chunks, d * chunksPerDocument + ordinal)
                    : undefined;
                const content = original?.content ?? benchText(d * chunksPerDocument + ordinal);
                const embedding = featureHash(content);
                return {
                  document_id: document.id,
                  ordinal,
                  heading_path: ['Benchmark', `Section ${String(ordinal)}`],
                  anchor: `${slug}#section-${String(ordinal)}`,
                  content,
                  token_count: original?.tokenCount ?? embedding.tokens,
                  content_hash: sha256Hex(`${slug}:${String(ordinal)}:${content}`),
                  embedding_model: EMBEDDING.MOCK_MODEL,
                  embedding: JSON.stringify(embedding.vector),
                };
              });
              await tx`INSERT INTO chunks ${tx(rows)}`;
            }
          });
          if ((start + 50) % 500 === 0)
            progress('generation.progress', { profile, documents: start + 50 });
        }
        await sql`UPDATE corpus_meta SET documents_total=${documents} WHERE id=1`;
      }
      progress('indexes.start', { profile, reused });
      // Keep this 100k-vector graph in memory while building. A single maintenance
      // worker avoids Docker's small /dev/shm limit; both settings are session-only.
      await sql`SET maintenance_work_mem = '1GB'`;
      await sql`SET max_parallel_maintenance_workers = 0`;
      await sql`CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw_idx ON chunks USING hnsw (embedding vector_cosine_ops) WITH (m=16, ef_construction=64)`;
      await sql`CREATE INDEX IF NOT EXISTS chunks_tsv_gin_idx ON chunks USING gin(tsv)`;
      await sql`ANALYZE documents`;
      await sql`ANALYZE chunks`;
      const queries = (
        profile === 'realistic'
          ? realisticQueries(goldenText)
          : benchQueries.map((question, index) => ({ id: `worst-${String(index)}`, question }))
      ).map((query) => ({ ...query, vector: featureHash(query.question).vector }));
      progress('warmup.start', { profile, queries: queries.length });
      for (const query of queries) await search(query.vector, query.question);
      const profileLoadBefore = loadavg();
      const records: {
        id: string;
        question: string;
        latencyMs: number;
        ftsMatchCount: number;
        explain?: unknown;
      }[] = [];
      progress('measurement.start', { profile });
      for (const query of queries) {
        const start = performance.now();
        const result = await search(query.vector, query.question);
        const latencyMs = performance.now() - start;
        if (!result.chunks.length) throw new Error('Benchmark search returned no candidates.');
        records.push({ id: query.id, question: query.question, latencyMs, ftsMatchCount: 0 });
      }
      const profileLoadAfter = loadavg();
      // Diagnostics are a separate pass, after all timed queries. Fixed sample,
      // independent of observed latency: every 20th query, starting at zero.
      for (const [index, query] of queries.entries()) {
        const record = records[index];
        if (!record) throw new Error('Missing measurement.');
        const [count] = await sql<
          { count: number }[]
        >`SELECT count(*)::int AS count FROM chunks WHERE tsv @@ websearch_to_tsquery('english'::regconfig, ${query.question})`;
        record.ftsMatchCount = count?.count ?? 0;
        if (index % 20 === 0)
          record.explain = await explainSearch(sql, query.vector, query.question);
      }
      const measurements = records.map((record) => record.latencyMs);
      profiles[profile] = {
        label:
          profile === 'realistic'
            ? `Committed ${corpusSubject} chunk distribution; golden questions and request paraphrases`
            : 'Worst case: original high-frequency synthetic topics and queries',
        schema,
        generator,
        reused,
        documents,
        chunks: totalChunks,
        source:
          profile === 'realistic'
            ? {
                files: material.files,
                sourceChunks: material.chunks.length,
                goldenSha256: sha256Hex(goldenText),
                tokenCount: {
                  min: Math.min(...material.chunks.map((c) => c.tokenCount)),
                  p50: percentile(
                    material.chunks.map((c) => c.tokenCount),
                    0.5,
                  ),
                  max: Math.max(...material.chunks.map((c) => c.tokenCount)),
                },
              }
            : undefined,
        queryCount: queries.length,
        warmupQueries: queries.length,
        p50Ms: percentile(measurements, 0.5),
        p95Ms: percentile(measurements, 0.95),
        p99Ms: percentile(measurements, 0.99),
        targetP95Ms: 300,
        targetMet: percentile(measurements, 0.95) <= 300,
        loadAverageBefore: profileLoadBefore,
        loadAverageAfter: profileLoadAfter,
        records,
      };
      progress('profile.complete', { profile, p95Ms: percentile(measurements, 0.95) });
    }
    const details =
      await sql`SELECT version() AS postgres, (SELECT extversion FROM pg_extension WHERE extname='vector') AS pgvector,
      pg_database_size(current_database())::text AS database_bytes,
      pg_total_relation_size('chunks')::text AS chunks_bytes,
      current_setting('shared_buffers') AS shared_buffers, current_setting('work_mem') AS work_mem,
      current_setting('maintenance_work_mem') AS maintenance_work_mem, current_setting('max_parallel_maintenance_workers') AS max_parallel_maintenance_workers, current_setting('effective_cache_size') AS effective_cache_size`;
    const indexes =
      await sql`SELECT indexname, indexdef FROM pg_indexes WHERE tablename='chunks' ORDER BY indexname`;
    console.log(
      JSON.stringify(
        {
          benchmark: 'T-63 / NFR-21',
          measuredAt: new Date().toISOString(),
          provisional: true,
          note: 'Reviewer takes official measurement when the machine is idle. Synthetic mock vectors are not a retrieval-quality evaluation.',
          database: {
            name: 'sourced_bench',
            host: target.hostname,
            port: target.port || '5432',
            ...details[0],
            indexes,
          },
          machine: {
            platform: platform(),
            release: release(),
            arch: process.arch,
            node: process.version,
            cpu: cpus()[0]?.model,
            logicalCpus: cpus().length,
            totalMemoryBytes: totalmem(),
            freeMemoryBytes: freemem(),
            loadAverageBefore: before,
            loadAverageAfter: loadavg(),
          },
          corpus: {
            documents,
            chunks: totalChunks,
            dimensions: EMBEDDING.DIMENSIONS,
            embeddingModel: EMBEDDING.MOCK_MODEL,
            generator: 'realistic-v2 and synthetic-v1',
          },
          profiles,
          measurement: {
            path: 'search() including schema checks, transaction and candidate counts; excludes embedding',

            percentileMethod: 'nearest rank',
            retrieval: RETRIEVAL,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await closeSqlForTests();
    if (locked) await admin`SELECT pg_advisory_unlock(636363)`;
    await admin.end();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    if (error instanceof Error) {
      const code =
        'code' in error && typeof error.code === 'string' && /^[A-Z0-9_]{1,32}$/.test(error.code)
          ? error.code
          : undefined;
      // Errors this script throws itself carry no driver code and safe, actionable text.
      const message = code === undefined ? error.message : undefined;
      console.error(JSON.stringify({ event: 'benchmark.error', name: error.name, code, message }));
    }
    // Never print connection/provider details from driver errors.
    console.error(
      'Benchmark failed. Check local sourced_bench URL, mock mode, database availability and --regenerate for an incomplete corpus.',
    );
    process.exitCode = 1;
  });
}
