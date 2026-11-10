import { AppError } from '@/lib/errors';
import { parseArgs } from 'node:util';
import postgres from 'postgres';
import { loadConfig } from '@/lib/kit/load-config';
import { getKitConfig } from '@/lib/kit/runtime-config';
import { ensureCorpusSchema } from '@/lib/kit/vector-schema';
import { getEnv } from '@/lib/env';
import { getProviders } from '@/lib/llm';
import { assertIngestAllowed, loadCorpus } from '@/lib/ingest/load';
import { previewCorpus } from '@/lib/ingest/preview';
import { ingestCorpus } from '@/lib/ingest/upsert';
import { formatIngestReport } from '@/lib/ingest/report';
import { RobotsDisallowedError } from '@/lib/ingest/robots';

try {
  const env = getEnv();
  await loadConfig();
  const config = getKitConfig();
  assertIngestAllowed(env.VERCEL);
  const { values } = parseArgs({
    options: {
      'dry-run': { type: 'boolean' },
      'fetch-only': { type: 'boolean' },
      'include-fixtures': { type: 'boolean' },
      refresh: { type: 'boolean' },
      offline: { type: 'boolean' },
      rebuild: { type: 'boolean' },
      yes: { type: 'boolean' },
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
      onEvent: (event) => {
        if (event.type === 'skipped') console.log(`${event.reason} ${event.key}`);
      },
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
      await ensureCorpusSchema(sql, config, {
        rebuild: values.rebuild ?? false,
        confirmed: values.yes ?? false,
      });
      const report = await ingestCorpus({
        sql,
        loadDocuments,
        provider: getProviders().embed,
        embeddingModel: config.models.embed.model,
        includeFixtures,
        pricePerMillion: env.PRICE_EMBED_PER_MTOK,
      });
      await sql`UPDATE corpus_meta SET documents_total=${report.documentsTotal}, updated_at=now() WHERE id=1`;
      console.log(formatIngestReport(report, new Date()));
    } finally {
      await sql.end();
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Ingest failed.');
  process.exitCode =
    error instanceof RobotsDisallowedError ||
    (error instanceof AppError &&
      (error.code === 'CORPUS_MISMATCH' || error.code === 'CORPUS_EMPTY'))
      ? 2
      : 1;
}
