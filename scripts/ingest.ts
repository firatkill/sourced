import { parseArgs } from 'node:util';
import postgres from 'postgres';
import { EMBEDDING } from '@/lib/config';
import { getEnv } from '@/lib/env';
import { getProvider } from '@/lib/llm';
import { assertIngestAllowed, loadCorpus } from '@/lib/ingest/load';
import { previewCorpus } from '@/lib/ingest/preview';
import { ingestCorpus } from '@/lib/ingest/upsert';
import { formatIngestReport } from '@/lib/ingest/report';
import { RobotsDisallowedError } from '@/lib/ingest/robots';

try {
  const env = getEnv();
  assertIngestAllowed(env.VERCEL);
  const { values } = parseArgs({
    options: {
      'dry-run': { type: 'boolean' },
      'fetch-only': { type: 'boolean' },
      'include-fixtures': { type: 'boolean' },
      refresh: { type: 'boolean' },
      offline: { type: 'boolean' },
    },
    strict: true,
  });
  const includeFixtures = (values['include-fixtures'] ?? false) || env.INGEST_INCLUDE_FIXTURES;
  const loadDocuments = () =>
    loadCorpus({
      offline: values.offline ?? false,
      refresh: values.refresh ?? false,
      includeFixtures,
      fetchOnly: values['fetch-only'] ?? false,
      onStatus: (slug, status) => {
        console.log(`${status} ${slug}`);
      },
    });
  if (values['fetch-only']) await loadDocuments();
  else if (values['dry-run'])
    console.log(
      JSON.stringify(previewCorpus(await loadDocuments(), env.PRICE_EMBED_PER_MTOK), null, 2),
    );
  else {
    const sql = postgres(env.MIGRATION_DATABASE_URL ?? env.DATABASE_URL, {
      prepare: false,
      types: { bigint: postgres.BigInt },
    });
    try {
      const report = await ingestCorpus({
        sql,
        loadDocuments,
        provider: getProvider(),
        embeddingModel: env.LLM_MODE === 'mock' ? EMBEDDING.MOCK_MODEL : EMBEDDING.MODEL,
        includeFixtures,
        pricePerMillion: env.PRICE_EMBED_PER_MTOK,
      });
      console.log(formatIngestReport(report, new Date()));
    } finally {
      await sql.end();
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Ingest failed.');
  process.exitCode = error instanceof RobotsDisallowedError ? 2 : 1;
}
