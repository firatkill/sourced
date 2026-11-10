import { getKitConfig } from '@/lib/kit/runtime-config';
import { ensureCorpusSchema } from '@/lib/kit/vector-schema';
import { loadConfig } from '@/lib/kit/load-config';
import postgres from 'postgres';
import { EMBEDDING } from '@/lib/config';
import { getEnv } from '@/lib/env';
import { mockProvider } from '@/lib/llm/mock';
import { assertIngestAllowed, loadCorpus } from '@/lib/ingest/load';
import { ingestCorpus } from '@/lib/ingest/upsert';
import { formatIngestReport } from '@/lib/ingest/report';

import { seedSuggestedCache } from './cache-suggested';

try {
  await loadConfig();
  const env = getEnv();
  assertIngestAllowed(env.VERCEL);
  const sql = postgres(env.MIGRATION_DATABASE_URL ?? env.DATABASE_URL, {
    prepare: false,
    types: { bigint: postgres.BigInt },
  });
  try {
    await ensureCorpusSchema(sql, getKitConfig());
    const report = await ingestCorpus({
      sql,
      loadDocuments: () => loadCorpus({ offline: true, refresh: false, includeFixtures: false }),
      provider: mockProvider,
      embeddingModel: EMBEDDING.MOCK_MODEL,
      includeFixtures: false,
      pricePerMillion: 0,
    });
    await sql`UPDATE corpus_meta SET documents_total=${report.documentsTotal}, updated_at=now() WHERE id=1`;
    await seedSuggestedCache();
    console.log(formatIngestReport(report, new Date()));
  } finally {
    await sql.end();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Seed failed.');
  process.exitCode = 1;
}
