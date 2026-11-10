import type postgres from 'postgres';
import type { LoadedCorpus } from '@/lib/ingest/load';
import { chunkContentHash } from '@/lib/ingest/chunk';
import { countTokens } from '@/lib/ingest/tokenizer';
import type { SourceEvent } from '@/lib/sources/types';
import { emptyCounters, type IngestSource } from '../schemas/ingest';

/** Read-only comparison; mirrors the v1 upsert's hash and metadata decisions. */
export async function planIngest(
  sql: postgres.Sql,
  loaded: LoadedCorpus,
  events: SourceEvent[],
  model: string,
  price: number | undefined,
  rebuild = false,
): Promise<IngestSource[]> {
  const previous = await sql<
    {
      slug: string;
      source_id: string | null;
      url: string;
      content_hash: string;
      embedding_model: string;
      ordinal: number;
      heading_path: string[];
      anchor: string;
      page_from: number | null;
      page_to: number | null;
    }[]
  >`
    SELECT d.slug,d.source_id,d.url,c.content_hash,c.embedding_model,c.ordinal,c.heading_path,c.anchor,c.page_from,c.page_to
    FROM chunks c JOIN documents d ON d.id=c.document_id`;
  const sources = loaded.sources.map((source) => ({ ...emptyCounters(), ...source }));
  const fallback = sources[0]?.id ?? 'fixtures';
  const get = (id: string) => {
    let source = sources.find((s) => s.id === id);
    if (!source) {
      source = { ...emptyCounters(), id };
      sources.push(source);
    }
    return source;
  };
  const current = new Map(loaded.map((doc) => [doc.slug, doc]));
  for (const doc of loaded) {
    const source = get(doc.sourceId ?? fallback);
    source.documents.done++;
    for (const chunk of doc.chunks) {
      const hash = chunkContentHash(doc.locationSlug ?? doc.slug, chunk);
      const prior = previous.find(
        (p) =>
          !rebuild && p.slug === doc.slug && p.content_hash === hash && p.embedding_model === model,
      );
      if (!prior) {
        source.chunks.new++;
        source.embeddingTokens += countTokens(
          `${chunk.headingPath.join(' › ')}\n\n${chunk.content}`,
        );
      } else if (
        prior.ordinal !== chunk.ordinal ||
        prior.anchor !== chunk.anchor ||
        JSON.stringify(prior.heading_path) !== JSON.stringify(chunk.headingPath) ||
        prior.page_from !== (chunk.pageFrom ?? null) ||
        prior.page_to !== (chunk.pageTo ?? null)
      )
        source.chunks.changed++;
      else source.chunks.unchanged++;
    }
  }
  for (const prior of previous) {
    const doc = current.get(prior.slug);
    const legacy = loaded.find((d) => d.url === prior.url);
    const id = prior.source_id ?? legacy?.sourceId ?? fallback;
    if (!sources.some((s) => s.id === id)) continue;
    if (!doc && loaded.discoveredKeys.includes(prior.slug)) continue;
    if (
      rebuild ||
      !doc ||
      !doc.chunks.some(
        (c) =>
          chunkContentHash(doc.locationSlug ?? doc.slug, c) === prior.content_hash &&
          prior.embedding_model === model,
      )
    )
      get(id).chunks.deleted++;
  }
  for (const source of sources) {
    const sourceEvents = events.filter((e) => e.key.startsWith(`${source.id}:`));
    source.documents.discovered = new Set(
      sourceEvents.filter((e) => e.type === 'discovered').map((e) => e.key),
    ).size;
    source.skipped = sourceEvents.flatMap((e) =>
      e.type === 'skipped' ? [{ key: e.key, reason: e.reason }] : [],
    );
    source.documents.skipped = source.skipped.length;
    source.documents.failed = loaded.failedKeys.filter((k) => k.startsWith(`${source.id}:`)).length;
    source.documents.discovered = Math.max(
      source.documents.discovered,
      source.documents.done + source.documents.failed,
    );
    source.boilerplateRemoved = loaded.boilerplateRemoved?.[source.id] ?? 0;
    source.warnings = loaded.warningsBySource?.[source.id] ?? 0;
    source.estimatedCostUsd =
      price === undefined ? null : (source.embeddingTokens * price) / 1_000_000;
  }
  return sources;
}
