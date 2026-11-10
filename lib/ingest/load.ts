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
import { createUrlsDriver, createRawCache } from '@/lib/sources/urls';
import { createSitemapDriver } from '@/lib/sources/sitemap';
import { createCrawlDriver } from '@/lib/sources/crawl';
import {
  locationSlug,
  type SourceContext,
  type SourceEvent,
  type RawDocument,
  type Source,
} from '@/lib/sources/types';
import { createFetchSession } from './fetch';
import { parseHtml, type ParsedDocument } from './parse-html';
import { parseMarkdown } from './parse-markdown';
import { parsePdf } from './parse-pdf';
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
  warnings: number;
};
export async function loadCorpus(options: {
  offline: boolean;
  refresh: boolean;
  includeFixtures: boolean;
  fetchOnly?: boolean;
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
    warnings: 0,
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
  const cache = createRawCache(createFetchSession(ctx));
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
      } catch {
        if (!documents.failedKeys.includes(ref.key)) documents.failedKeys.push(ref.key);
        continue;
      }
      if (options.fetchOnly) continue;
      const slug = locationSlug(ref.location);
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
          !['text/html', 'text/markdown', 'text/mdx'].includes(raw.mimeType)
        )
          throw new AppError(
            'UNSUPPORTED_MEDIA_TYPE',
            'This source format requires its M6 parser.',
          );
        if (!options.parse && isDocx) {
          const parsed = await parseDocx(raw.bytes, slug);
          document = parsed.document;
          documents.warnings += parsed.warnings;
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
      const chunks = chunkDocument(document, slug);
      if (!chunks.length) {
        context.onEvent({ type: 'skipped', key: ref.key, reason: 'empty' });
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
        chunks,
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
        chunks: chunkDocument(document, page.slug),
        document,
      });
    }
  }
  if (options.fetchOnly && documents.failedKeys.length)
    throw new AppError('INTERNAL_ERROR', 'Some source items could not be fetched.');
  return documents;
}
