import postgres from 'postgres';
import { EMBEDDING } from '@/lib/config';
import { getEnv } from '@/lib/env';
import { mockProvider } from '@/lib/llm/mock';
import { assertIngestAllowed, loadCorpus } from '@/lib/ingest/load';
import { ingestCorpus } from '@/lib/ingest/upsert';
import { formatIngestReport } from '@/lib/ingest/report';

// T-26 supplies the mock suggested-answer cache after its schema contract is implemented.
function seedSuggestedCache(): Promise<void> {
  return Promise.resolve();
}

try {
  const env = getEnv();
  assertIngestAllowed(env.VERCEL);
  const sql = postgres(env.MIGRATION_DATABASE_URL ?? env.DATABASE_URL, {
    prepare: false,
    types: { bigint: postgres.BigInt },
  });
  try {
    const report = await ingestCorpus({
      sql,
      loadDocuments: () => loadCorpus({ offline: true, refresh: false, includeFixtures: false }),
      provider: mockProvider,
      embeddingModel: EMBEDDING.MOCK_MODEL,
      includeFixtures: false,
      pricePerMillion: 0,
    });
    await seedSuggestedCache();
    console.log(formatIngestReport(report, new Date()));
  } finally {
    await sql.end();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Seed failed.');
  process.exitCode = 1;
}
