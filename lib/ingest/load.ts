import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { z } from 'zod';
import { AppError } from '@/lib/errors';
import { sha256Hex } from '@/lib/hash';
import { getKitConfig } from '@/lib/kit/runtime-config';
import type { KitConfig } from '@/lib/kit/config-schema';
import { createFolderDriver } from '@/lib/sources/folder';
import { createGitDriver } from '@/lib/sources/git';
import { createUrlsDriver, createRawCache, cacheFs } from '@/lib/sources/urls';
import { createSitemapDriver } from '@/lib/sources/sitemap';
import { createCrawlDriver } from '@/lib/sources/crawl';
import {
  sourceLocationSlug,
  type SourceContext,
  type SourceEvent,
  type RawDocument,
  type Source,
} from '@/lib/sources/types';
import { createFetchSession } from './fetch';
import { RobotsDisallowedError } from './robots';
import { parseHtml, type ParsedDocument } from './parse-html';
import { parseMarkdown } from './parse-markdown';
import { parsePdf } from './parse-pdf';
import { parseText } from './parse-text';
import { removeBoilerplate } from './boilerplate';
import { parseDocx } from './parse-docx';
import { chunkDocument } from './chunk';
import type { IngestDocument } from './upsert';

export function assertIngestAllowed(vercel: string | undefined): void {
  if (vercel) throw new AppError('INTERNAL_ERROR', 'Ingestion is not allowed on Vercel.');
}
const Metadata = z.object({
  version: z.string(),
  fixtures: z.array(
    z.object({ slug: z.string(), section: z.string(), path: z.string(), url: z.url() }),
  ),
});
export type LoadedCorpus = (IngestDocument & { document: ParsedDocument })[] & {
  sources: { id: string; revision?: string }[];
  failedKeys: string[];
  discoveredKeys: string[];
  skippedItems: { key: string; reason: string }[];
  boilerplateRemoved?: Record<string, number>;
  warnings: number;
  warningsBySource?: Record<string, number>;
};
export async function loadCorpus(options: {
  offline: boolean;
  refresh: boolean;
  includeFixtures: boolean;
  fetchOnly?: boolean;
  readOnly?: boolean;
  onStatus?: (slug: string, status: 'fetched' | 'unchanged' | 'failed') => void;
  onEvent?: (event: SourceEvent) => void;
  config?: KitConfig;
  parse?: (raw: RawDocument, source: Source) => ParsedDocument;
}) {
  const config = options.config ?? getKitConfig();
  let metadata: z.infer<typeof Metadata> = { version: '1', fixtures: [] };
  try {
    metadata = Metadata.parse(
      JSON.parse(await readFile(join('corpus', config.corpus.name, 'metadata.json'), 'utf8')),
    );
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }
  const documents: LoadedCorpus = Object.assign([], {
    sources: [] as LoadedCorpus['sources'],
    failedKeys: [] as string[],
    discoveredKeys: [] as string[],
    skippedItems: [] as { key: string; reason: string }[],
    warnings: 0,
    warningsBySource: {},
  });
  const ctx: SourceContext = {
    repoRoot: process.cwd(),
    rawDir: '',
    offline: options.offline,
    refresh: options.refresh,
    fetch,
    now: Date.now,
    sleep: (ms) => setTimeout(ms),
    onEvent(event) {
      options.onEvent?.(event);
      if (event.type === 'discovered' && !documents.discoveredKeys.includes(event.key))
        documents.discoveredKeys.push(event.key);
      if (event.type === 'skipped')
        documents.skippedItems.push({ key: event.key, reason: event.reason });
      if (event.type === 'failed' && !documents.failedKeys.includes(event.key))
        documents.failedKeys.push(event.key);
      if (event.type === 'revision') {
        const source = documents.sources.find((s) => s.id === event.sourceId);
        if (source) source.revision = event.revision;
      }
      if (event.type === 'fetched' || event.type === 'cached' || event.type === 'failed')
        options.onStatus?.(event.key, event.type === 'cached' ? 'unchanged' : event.type);
    },
  };
  const cache = createRawCache(
    createFetchSession(ctx),
    options.readOnly ? { read: cacheFs.read, write: async () => {} } : cacheFs,
  );
  const drivers = {
    folder: createFolderDriver(),
    git: createGitDriver(),
    urls: createUrlsDriver(cache),
    sitemap: createSitemapDriver(cache),
    crawl: createCrawlDriver(cache),
  };
  for (const source of config.sources) {
    documents.sources.push({ id: source.id });
    const context = { ...ctx, rawDir: join('corpus', config.corpus.name, 'raw', source.id) };
    const discover = () => {
      switch (source.type) {
        case 'folder':
          return drivers.folder.discover(source, context);
        case 'git':
          return drivers.git.discover(source, context);
        case 'urls':
          return drivers.urls.discover(source, context);
        case 'sitemap':
          return drivers.sitemap.discover(source, context);
        case 'crawl':
          return drivers.crawl.discover(source, context);
      }
    };
    for await (const ref of discover()) {
      let raw: RawDocument;
      try {
        raw = await drivers[source.type].load(ref, context);
      } catch (error) {
        // Preserve robots refusals for the CLI's user-action exit 2 (TRD §34.2).
        if (error instanceof RobotsDisallowedError) throw error;
        if (!documents.failedKeys.includes(ref.key)) documents.failedKeys.push(ref.key);
        continue;
      }
      if (options.fetchOnly) continue;
      const slug = sourceLocationSlug(ref, source);
      let document: ParsedDocument;
      try {
        const isPdf = raw.mimeType === 'application/pdf' || /\.pdf$/i.test(slug);
        const isDocx =
          raw.mimeType ===
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
          /\.docx$/i.test(slug);
        if (
          !options.parse &&
          !isPdf &&
          !isDocx &&
          !['text/html', 'text/markdown', 'text/mdx', 'text/plain'].includes(raw.mimeType)
        )
          throw new AppError(
            'UNSUPPORTED_MEDIA_TYPE',
            'This source format requires its M6 parser.',
          );
        if (!options.parse && isDocx) {
          const parsed = await parseDocx(raw.bytes, slug);
          document = parsed.document;
          documents.warnings += parsed.warnings;
          if (documents.warningsBySource)
            documents.warningsBySource[source.id] =
              (documents.warningsBySource[source.id] ?? 0) + parsed.warnings;
        } else if (!options.parse && isPdf) {
          const parsed = await parsePdf(raw.bytes, slug);
          if (parsed.status === 'needs_ocr') {
            context.onEvent({ type: 'skipped', key: ref.key, reason: 'needs_ocr' });
            continue;
          }
          document = parsed.document;
        } else
          document = options.parse
            ? options.parse(raw, source)
            : raw.mimeType === 'text/plain'
              ? parseText(Buffer.from(raw.bytes).toString('utf8'), slug)
              : raw.mimeType === 'text/markdown' || raw.mimeType === 'text/mdx'
                ? parseMarkdown(
                    Buffer.from(raw.bytes).toString('utf8'),
                    slug,
                    raw.mimeType === 'text/mdx',
                  )
                : parseHtml(Buffer.from(raw.bytes).toString('utf8'), {
                    slug,
                    section: source.group ?? source.id,
                    html: { ...source.html, contentSelector: source.html.contentSelector ?? '' },
                  });
      } catch (error) {
        context.onEvent({
          type: 'failed',
          key: ref.key,
          code: error instanceof AppError ? error.code : 'INTERNAL_ERROR',
        });
        continue;
      }
      documents.push({
        slug: ref.key,
        locationSlug: slug,
        sourceId: source.id,
        sourceKind: ref.location.kind,
        mimeType: raw.mimeType,
        url: ref.location.kind === 'web' ? ref.location.url : ref.location.path,
        title: document.title,
        version: metadata.version,
        section: source.group ?? source.id,
        contentHash: raw.contentHash,
        isFixture: false,
        chunks: [],
        document,
      });
    }
  }
  if (options.includeFixtures && !options.fetchOnly) {
    for (const page of metadata.fixtures) {
      const bytes = await readFile(page.path);
      const html = config.sources[0]?.html;
      const document = parseHtml(bytes.toString('utf8'), {
        ...page,
        html: {
          preset: html?.preset ?? 'postgres-docbook',
          contentSelector: html?.contentSelector ?? 'body',
          removeSelectors: html?.removeSelectors ?? [],
        },
      });
      documents.push({
        ...page,
        title: document.title,
        version: metadata.version,
        contentHash: sha256Hex(bytes),
        isFixture: true,
        chunks: [],
        document,
      });
    }
  }
  if (!options.fetchOnly) {
    documents.boilerplateRemoved = removeBoilerplate(documents);
    for (let index = documents.length - 1; index >= 0; index--) {
      const doc = documents[index];
      if (!doc) continue;
      doc.chunks = chunkDocument(doc.document, doc.locationSlug ?? doc.slug);
      if (!doc.chunks.length) {
        ctx.onEvent({ type: 'skipped', key: doc.slug, reason: 'empty' });
        documents.splice(index, 1);
      }
    }
  }
  if (options.fetchOnly && documents.failedKeys.length)
    throw new AppError('INTERNAL_ERROR', 'Some source items could not be fetched.');
  return documents;
}
