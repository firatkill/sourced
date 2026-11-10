import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { fileURLToPath } from 'node:url';
import { EMBEDDING } from '../../../lib/config';
import { KitConfigSchema } from '../../../lib/kit/config-schema';
import { ensureCorpusSchema } from '../../../lib/kit/vector-schema';
import { createMockProvider } from '../../../lib/llm/mock';
import { ingestCorpus } from '../../../lib/ingest/upsert';
import { requireLocalDatabase } from '../../helpers/local-database';
import fixtureConfig from './sourced.config';
import { loadCorpus } from '../../../lib/ingest/load';

export function loadFixtureDocuments() {
  return loadCorpus({
    config: KitConfigSchema.parse(fixtureConfig),
    offline: true,
    refresh: false,
    includeFixtures: false,
  });
}

export function fixtureDatabaseUrl(base: string | undefined): string {
  const url = new URL(requireLocalDatabase(base));
  // Never pass through a database name or connection options from the example/test URL.
  url.pathname = '/sourced_kit_tr';
  url.search = '';
  url.hash = '';
  return url.href;
}

export function mockFixtureConfig() {
  const config = KitConfigSchema.parse(fixtureConfig);
  config.models.chat = { provider: 'mock', model: 'mock' };
  config.models.embed = { ...config.models.embed, provider: 'mock', model: EMBEDDING.MOCK_MODEL };
  return config;
}

export async function setupFixtureDatabase(base: string | undefined) {
  const url = fixtureDatabaseUrl(base);
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const admin = postgres(adminUrl.href, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const rows = await admin`SELECT 1 FROM pg_database WHERE datname = 'sourced_kit_tr'`;
    if (!rows.length) await admin`CREATE DATABASE sourced_kit_tr`;
  } finally {
    await admin.end();
  }
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    await migrate(drizzle(sql), {
      migrationsFolder: fileURLToPath(new URL('../../../drizzle', import.meta.url)),
    });
    const config = mockFixtureConfig();
    await ensureCorpusSchema(sql, config);
    const report = await ingestCorpus({
      sql,
      loadDocuments: loadFixtureDocuments,
      provider: createMockProvider(config.models.embed.dimensions),
      embeddingModel: config.models.embed.model,
      contextualEmbedding: config.overrides.contextualEmbedding,
      includeFixtures: false,
      pricePerMillion: 0,
    });
    await sql`UPDATE corpus_meta SET documents_total=${report.documentsTotal}, updated_at=now() WHERE id=1`;
    return report;
  } finally {
    await sql.end();
  }
}
