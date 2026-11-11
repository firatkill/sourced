import { posix } from 'node:path';
import type { z } from 'zod';
import type { SourceSchema } from '@/lib/kit/config-schema';
import { AppError, type ErrorCode } from '@/lib/errors';

export type Source = z.infer<typeof SourceSchema>;
export type DocumentRef = {
  key: string;
  sourceId: string;
  location: { kind: 'web'; url: string } | { kind: 'file'; path: string };
  group: string | undefined;
};
export type RawDocument = DocumentRef & {
  bytes: Uint8Array;
  mimeType:
    | 'text/html'
    | 'text/markdown'
    | 'text/mdx'
    | 'application/pdf'
    | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    | 'text/plain';
  fetchedAt: Date;
  contentHash: string;
};
export type SourceEvent =
  | { type: 'discovered' | 'fetched' | 'cached'; key: string }
  | { type: 'skipped'; key: string; reason: string }
  | { type: 'failed'; key: string; code: ErrorCode }
  | { type: 'revision'; key: string; sourceId: string; revision: string };
export interface SourceDriver<S> {
  discover(source: S, ctx: SourceContext): AsyncIterable<DocumentRef>;
  load(ref: DocumentRef, ctx: SourceContext): Promise<RawDocument>;
}
export type SourceContext = {
  repoRoot: string;
  rawDir: string;
  offline: boolean;
  refresh: boolean;
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  onEvent: (e: SourceEvent) => void;
};
export function normalizeUrl(input: string): string {
  const url = new URL(input);
  url.hash = '';
  url.searchParams.sort();
  url.pathname = url.pathname.replace(/\/index\.html$/, '/');
  return url.href;
}
export function normalizePath(path: string): string {
  return posix.normalize(path.replaceAll('\\', '/')).replace(/^\.\//, '');
}
/** D-128: the base is a directory; file locations may already be source-relative. */
export function locationSlug(location: DocumentRef['location'], base: string): string {
  if (location.kind === 'file') {
    return (
      posix.relative(normalizePath(base), normalizePath(location.path)).replace(/\/$/, '') ||
      'index'
    );
  }
  const url = new URL(normalizeUrl(location.url));
  const path = posix.relative(base, url.pathname).replace(/\/$/, '') || 'index';
  return `${path}${url.search}`;
}

/** Resolve against the configured source, never the discovered/filtered subset. */
export function sourceLocationSlug(ref: DocumentRef, source: Source): string {
  if (ref.location.kind === 'file') {
    // Folder discovery resolves globs and literal files and records the effective root
    // in the source-relative key. Git delegates to the same driver at its subdir.
    return locationSlug({ kind: 'file', path: ref.key.slice(source.id.length + 1) }, '.');
  }
  let base: string;
  switch (source.type) {
    case 'urls': {
      const directories = source.urls.map((url) => new URL('.', normalizeUrl(url)).pathname);
      base = directories[0] ?? '/';
      for (const directory of directories) {
        while (!directory.startsWith(base))
          base = `${posix.dirname(base.slice(0, -1))}/`.replace(/\/+/g, '/');
      }
      break;
    }
    case 'sitemap':
      base = new URL('.', normalizeUrl(source.url)).pathname;
      break;
    case 'crawl':
      base = new URL('.', normalizeUrl(source.root)).pathname;
      break;
    case 'folder':
    case 'git':
      throw new AppError('VALIDATION_FAILED', 'A file source must have a file location.');
  }
  return locationSlug(ref.location, base);
}
export function webRef(source: Pick<Source, 'id' | 'group'>, url: string): DocumentRef {
  const normalized = normalizeUrl(url);
  return {
    key: `${source.id}:${normalized}`,
    sourceId: source.id,
    group: source.group,
    location: { kind: 'web', url: normalized },
  };
}
export const MIME_BY_EXTENSION: Readonly<Record<string, RawDocument['mimeType']>> = {
  '.md': 'text/markdown',
  '.mdx': 'text/mdx',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
};
