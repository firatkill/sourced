import { posix } from 'node:path';
import type { z } from 'zod';
import type { SourceSchema } from '@/lib/kit/config-schema';
import type { ErrorCode } from '@/lib/errors';

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
export function locationSlug(location: DocumentRef['location']): string {
  const path =
    location.kind === 'web'
      ? new URL(normalizeUrl(location.url)).pathname
      : normalizePath(location.path);
  return path.split('/').at(-1) || 'index.html';
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
