import { requireSources } from './config-files';
import postgres from 'postgres';
import { AppError } from '@/lib/errors';
import { configHash, loadConfig } from '@/lib/kit/load-config';
import { getKitConfig, setCliKitConfig } from '@/lib/kit/runtime-config';
import { ensureCorpusSchema } from '@/lib/kit/vector-schema';
import { getEnv } from '@/lib/env';
import { getProviders } from '@/lib/llm';
import { assertIngestAllowed, loadCorpus } from '@/lib/ingest/load';
import { ingestCorpus } from '@/lib/ingest/upsert';
import { formatIngestReport } from '@/lib/ingest/report';
import { confirmAction } from '../prompts';
import type { SourceEvent } from '@/lib/sources/types';
import { sumCounters, emptyCounters, type IngestSource } from '../schemas/ingest';
import { planIngest } from './ingest-report';
import type { Invocation, CommandContext } from '../router';

export async function confirmIngest(
  options: {
    tokens: number;
    cost: number | null;
    threshold: number;
    provider: string;
    model: string;
    yes: boolean;
    json: boolean;
  },
  context: CommandContext,
) {
  if (options.provider === 'ollama') return;
  if (options.cost === null ? options.tokens <= 1_000_000 : options.cost <= options.threshold)
    return;
  const message =
    options.cost === null
      ? `Price unknown for ${options.provider}:${options.model}; add it to pricing in sourced.config.ts to get an estimate.`
      : `Estimated embedding cost $${options.cost.toFixed(4)} exceeds $${options.threshold.toFixed(2)}. Continue?`;
  try {
    await confirmAction({
      yes: options.yes,
      json: options.json,
      isTTY: context.isTTY,
      message,
      ...(context.prompt ? { prompt: context.prompt } : {}),
    });
  } catch (error) {
    if (error instanceof AppError && error.code === 'NEEDS_CONFIRMATION')
      throw new AppError('NEEDS_CONFIRMATION', message);
    throw error;
  }
}

export async function runIngest(input: Invocation, context: CommandContext) {
  const dryRun = input.values['dry-run'] === true;
  setCliKitConfig(await loadConfig(process.cwd(), { writeSnapshot: !dryRun }));
  requireSources(getKitConfig());
  const env = getEnv();
  const config = structuredClone(getKitConfig());
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
  const interrupt = new AbortController();
  const onInterrupt = () => {
    interrupt.abort();
  };
  process.on('SIGINT', onInterrupt);
  try {
    const price =
      config.models.embed.provider === 'ollama'
        ? 0
        : config.pricing[`${config.models.embed.provider}:${config.models.embed.model}`]
            ?.inputPerMTok;
    let sources: IngestSource[] = [];
    const loadAndPlan = async () => {
      const loaded = await loadDocuments();
      sources = await planIngest(
        sql,
        loaded,
        events,
        config.models.embed.model,
        price,
        input.values.rebuild === true,
      );
      return loaded;
    };
    const loaded = await loadAndPlan();
    if (dryRun) {
      return {
        mode: 'dry-run' as const,
        runId: null,
        corpusVersion: null,
        sources,
        totals: sumCounters(sources),
      };
    }
    const totals = sumCounters(sources);
    await confirmIngest(
      {
        tokens: totals.embeddingTokens,
        cost: totals.estimatedCostUsd,
        threshold: env.INGEST_CONFIRM_ABOVE_USD,
        provider: config.models.embed.provider,
        model: config.models.embed.model,
        yes: input.values.yes === true,
        json: input.json,
      },
      context,
    );
    await ensureCorpusSchema(sql, config, {
      rebuild: input.values.rebuild === true,
      confirmed: input.values.yes === true,
    });
    const report = await ingestCorpus({
      sql,
      loadDocuments: () => Promise.resolve(loaded),
      configHash: configHash(config),
      restart: input.values.restart === true || input.values.rebuild === true,
      signal: interrupt.signal,
      onProgress: (message) => {
        context.progress(
          price === undefined ? message.replace(/est\. \$[0-9.]+/, 'est. unknown') : message,
        );
      },
      provider: getProviders().embed,
      embeddingModel: config.models.embed.model,
      includeFixtures,
      pricePerMillion: price ?? 0,
    });
    await sql`UPDATE corpus_meta SET documents_total=(SELECT count(*) FROM documents), updated_at=now() WHERE id=1`;
    context.progress(
      formatIngestReport(report, new Date()).replace(
        /est\. \$[0-9.]+/,
        totals.estimatedCostUsd === null
          ? 'est. unknown'
          : `est. $${report.costUsdEstimate.toFixed(4)}`,
      ),
    );
    for (const source of sources)
      context.progress(
        `${source.id}: ${String(source.documents.done)} documents, ${String(source.boilerplateRemoved)} boilerplate blocks removed; ${String(source.embeddingTokens)} embedding tokens; cost ${source.estimatedCostUsd === null ? 'unknown' : `$${source.estimatedCostUsd.toFixed(4)}`}${config.models.embed.provider === 'openai' ? '' : ' (approximate)'}`,
      );
    return {
      mode: 'run' as const,
      runId: report.runId ?? null,
      corpusVersion: report.corpusVersion,
      sources,
      totals: sumCounters(sources),
    };
  } catch (error) {
    if (interrupt.signal.aborted)
      context.progress(
        'Ingest interrupted. Run the same ingest command with the same configuration and flags to resume.',
      );
    throw error;
  } finally {
    process.off('SIGINT', onInterrupt);
    await sql.end();
  }
}
