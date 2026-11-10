import postgres from 'postgres';
import { AppError } from '@/lib/errors';
import { loadConfig } from '@/lib/kit/load-config';
import { getKitConfig, setCliKitConfig } from '@/lib/kit/runtime-config';
import { ensureCorpusSchema } from '@/lib/kit/vector-schema';
import { getEnv } from '@/lib/env';
import { getProviders } from '@/lib/llm';
import { assertIngestAllowed, loadCorpus } from '@/lib/ingest/load';
import { ingestCorpus } from '@/lib/ingest/upsert';
import { formatIngestReport } from '@/lib/ingest/report';
import type { SourceEvent } from '@/lib/sources/types';
import { sumCounters, emptyCounters, type IngestSource } from '../schemas/ingest';
import { planIngest } from './ingest-report';
import type { Invocation, CommandContext } from '../router';

export async function runIngest(input: Invocation, context: CommandContext) {
  const dryRun = input.values['dry-run'] === true;
  setCliKitConfig(await loadConfig(process.cwd(), { writeSnapshot: !dryRun }));
  const env = getEnv();
  const config = getKitConfig();
  assertIngestAllowed(env.VERCEL);
  if (typeof input.values.source === 'string') {
    config.sources = config.sources.filter((s) => s.id === input.values.source);
    if (!config.sources.length)
      throw new AppError('VALIDATION_FAILED', 'Unknown source. Run pnpm sourced sources list.');
  }
  const includeFixtures = input.values['include-fixtures'] === true || env.INGEST_INCLUDE_FIXTURES;
  const events: SourceEvent[] = [];
  const loadDocuments = () =>
    loadCorpus({
      config,
      offline: input.values.offline === true,
      refresh: input.values.refresh === true,
      includeFixtures,
      fetchOnly: input.values['fetch-only'] === true,
      readOnly: dryRun,
      onEvent: (event) => {
        events.push(event);
        if (event.type === 'skipped') context.progress(`${event.reason} ${event.key}`);
      },
      onStatus: (slug, status) => {
        context.progress(`${status} ${slug}`);
      },
    });
  if (input.values['fetch-only']) {
    const loaded = await loadDocuments();
    const sources = loaded.sources.map((source) => ({ ...emptyCounters(), ...source }));
    return {
      mode: 'dry-run' as const,
      runId: null,
      corpusVersion: null,
      sources,
      totals: sumCounters(sources),
    };
  }
  const sql = postgres(env.MIGRATION_DATABASE_URL ?? env.DATABASE_URL, {
    prepare: false,
    types: { bigint: postgres.BigInt },
  });
  try {
    if (!dryRun && !input.values['fetch-only'])
      await ensureCorpusSchema(sql, config, {
        rebuild: input.values.rebuild === true,
        confirmed: input.values.yes === true,
      });
    const price =
      config.pricing[`${config.models.embed.provider}:${config.models.embed.model}`]?.inputPerMTok;
    let sources: IngestSource[] = [];
    const loadAndPlan = async () => {
      const loaded = await loadDocuments();
      sources = await planIngest(
        sql,
        loaded,
        events,
        config.models.embed.model,
        env.LLM_MODE === 'mock' ? env.PRICE_EMBED_PER_MTOK : price,
      );
      return loaded;
    };
    if (dryRun) {
      await loadAndPlan();
      return {
        mode: 'dry-run' as const,
        runId: null,
        corpusVersion: null,
        sources,
        totals: sumCounters(sources),
      };
    }
    const report = await ingestCorpus({
      sql,
      loadDocuments: loadAndPlan,
      provider: getProviders().embed,
      embeddingModel: config.models.embed.model,
      includeFixtures,
      pricePerMillion: env.PRICE_EMBED_PER_MTOK,
    });
    await sql`UPDATE corpus_meta SET documents_total=${report.documentsTotal}, updated_at=now() WHERE id=1`;
    context.progress(formatIngestReport(report, new Date()));
    return {
      mode: 'run' as const,
      runId: report.runId ?? null,
      corpusVersion: report.corpusVersion,
      sources,
      totals: sumCounters(sources),
    };
  } finally {
    await sql.end();
  }
}
