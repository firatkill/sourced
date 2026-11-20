import 'server-only';
// T-89: what /setup and Settings need to draw themselves. Keys are only ever masked.
import type postgres from 'postgres';
import { getEnv, setupState } from '@/lib/env';
import type { KitConfig } from '@/lib/kit/config-schema';
import { isExample, readConfig } from './config';
import { maskKey } from './env-file';
import { ingestProgress } from './ingest-job';
import { KEYED_PROVIDERS } from './keys';

function describeSource(source: KitConfig['sources'][number]): string {
  if ('path' in source) return source.path;
  if ('urls' in source) return source.urls.join(', ');
  if ('url' in source) return source.url;
  return source.root;
}

export async function setupStatus(sql: postgres.Sql) {
  const config = readConfig();
  const state = setupState();
  const used = new Set(
    Object.values(config.models).flatMap((model) => (model ? [model.provider] : [])),
  );
  const [counts] = await sql<{ documents: number; chunks: number }[]>`
    SELECT (SELECT count(*)::int FROM documents) AS documents,
      (SELECT count(*)::int FROM chunks) AS chunks`;
  const perSource = new Map(
    (
      await sql<{ source: string; documents: number }[]>`
        SELECT source_id AS source, count(*)::int AS documents FROM documents
        WHERE source_id IS NOT NULL GROUP BY source_id`
    ).map((row) => [row.source, row.documents]),
  );
  return {
    setupRequired: state.required,
    llmMode: getEnv().LLM_MODE,
    providers: Object.entries(KEYED_PROVIDERS).map(([id, provider]) => ({
      id,
      label: provider.label,
      env: provider.env,
      used: used.has(id as keyof typeof KEYED_PROVIDERS),
      saved: Boolean(process.env[provider.env]?.trim()),
      masked: maskKey(process.env[provider.env]?.trim()),
    })),
    ollama: { used: used.has('ollama'), baseUrl: getEnv().OLLAMA_BASE_URL },
    models: {
      chat: `${config.models.chat.provider}:${config.models.chat.model}`,
      embed: `${config.models.embed.provider}:${config.models.embed.model}:${String(config.models.embed.dimensions)}`,
    },
    library: {
      example: isExample(config),
      sources: config.sources.map((source) => ({
        id: source.id,
        type: source.type,
        location: describeSource(source),
        documents: perSource.get(source.id) ?? 0,
      })),
      documents: counts?.documents ?? 0,
      chunks: counts?.chunks ?? 0,
    },
    ingest: await ingestProgress(sql),
  };
}
export type SetupStatus = Awaited<ReturnType<typeof setupStatus>>;
