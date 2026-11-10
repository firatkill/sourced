/** Manual T-59 harness: real SIGINT, mock provider, isolated localhost database. */
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { setTimeout } from 'node:timers/promises';
import { requireLocalDatabase } from './local-database';
import { getKitConfig } from '../../lib/kit/runtime-config';
import { SourceSchema } from '../../lib/kit/config-schema';
import { loadCorpus } from '../../lib/ingest/load';
import { ingestCorpus } from '../../lib/ingest/upsert';
import { mockProvider } from '../../lib/llm/mock';
import { EMBEDDING } from '../../lib/config';
import { IngestInterrupted } from '../../lib/ingest/checkpoint';

const mode = process.argv[2];
const url = new URL(requireLocalDatabase(process.env.DATABASE_URL));
url.pathname = mode === 'baseline' ? '/sourced_t59_baseline' : '/sourced_t59_interrupt_node';
url.search = '';
url.hash = '';
const adminUrl = new URL(url);
adminUrl.pathname = '/postgres';
const admin = postgres(adminUrl.href, { prepare: false, onnotice: () => {} });
try {
  const name = url.pathname.slice(1);
  if (!(await admin`SELECT 1 FROM pg_database WHERE datname=${name}`).length)
    await admin`CREATE DATABASE ${admin(name)}`;
} finally {
  await admin.end();
}
const sql = postgres(url.href, { prepare: false, onnotice: () => {} });
const controller = new AbortController();
const interrupt = () => {
  controller.abort();
};
process.on('SIGINT', interrupt);
try {
  await migrate(drizzle(sql), { migrationsFolder: 'drizzle' });
  const config = getKitConfig();
  config.sources = [
    SourceSchema.parse({ id: 'mixed', type: 'folder', path: 'tests/fixtures/mixed-folder' }),
  ];
  const loaded = await loadCorpus({
    config,
    offline: true,
    refresh: false,
    includeFixtures: false,
  });
  const report = await ingestCorpus({
    sql,
    loadDocuments: () => Promise.resolve(loaded),
    provider: {
      embed: async (...args) => {
        process.stdout.write('embedding in flight\n');
        await setTimeout(5000);
        return mockProvider.embed(...args);
      },
    },
    embeddingModel: EMBEDDING.MOCK_MODEL,
    includeFixtures: false,
    pricePerMillion: 0,
    configHash: 't59-mixed-manual',
    signal: controller.signal,
    onProgress: (message) => {
      process.stdout.write(`${message}\n`);
    },
  });
  process.stdout.write(JSON.stringify(report) + '\n');
} catch (error) {
  if (!(error instanceof IngestInterrupted)) throw error;
  process.stdout.write(
    'Interrupted. Resume: node --import tsx --conditions=react-server --env-file-if-exists=.env.local tests/helpers/ingest-sigint.ts resume\n',
  );
  process.exitCode = 130;
} finally {
  const [counts] =
    await sql`SELECT (SELECT count(*)::int FROM documents) AS documents,(SELECT count(*)::int FROM chunks) AS chunks,(SELECT count(*)::int FROM ingest_items WHERE status='done') AS done,(SELECT count(*)::int FROM ingest_items WHERE status='pending') AS pending`;
  process.stdout.write(JSON.stringify(counts) + '\n');
  process.off('SIGINT', interrupt);
  await sql.end();
}
