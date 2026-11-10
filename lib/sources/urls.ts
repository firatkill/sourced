import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { z } from 'zod';
import { AppError } from '@/lib/errors';
import { sha256Hex } from '@/lib/hash';
import { createFetchSession } from '@/lib/ingest/fetch';
import { included } from './folder';
import {
  MIME_BY_EXTENSION,
  normalizeUrl,
  webRef,
  type Source,
  type SourceDriver,
  type SourceContext,
  type DocumentRef,
} from './types';

export type CacheFs = {
  read: (path: string) => Promise<Uint8Array | undefined>;
  write: (path: string, bytes: Uint8Array) => Promise<void>;
};
export const cacheFs: CacheFs = {
  async read(path) {
    try {
      return await readFile(path);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
      throw error;
    }
  },
  async write(path, bytes) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
  },
};
const Entry = z.object({
  url: z.url(),
  etag: z.string().nullable(),
  'last-modified': z.string().nullable(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  mimeType: z.string(),
  fetchedAt: z.iso.datetime(),
});
const Index = z.record(z.string(), Entry);
export function rawFilename(url: string, mimeType?: string): string {
  const extension =
    Object.entries(MIME_BY_EXTENSION).find(([, mime]) => mime === mimeType)?.[0] ??
    (extname(new URL(url).pathname).toLowerCase() === '.xml'
      ? '.xml'
      : extname(new URL(url).pathname).toLowerCase() in MIME_BY_EXTENSION
        ? extname(new URL(url).pathname).toLowerCase()
        : '.html');
  return `${createHash('sha1').update(normalizeUrl(url)).digest('hex')}${extension}`;
}
export function createRawCache(
  request: ReturnType<typeof createFetchSession>,
  fs: CacheFs = cacheFs,
) {
  // Serialize index read/modify/write within each source to avoid losing concurrent entries.
  const tails = new Map<string, Promise<unknown>>();
  return (ref: DocumentRef, ctx: SourceContext) => {
    const operation = (tails.get(ctx.rawDir) ?? Promise.resolve()).then(async () => {
      if (ref.location.kind !== 'web')
        throw new AppError('VALIDATION_FAILED', 'Expected a web source.');
      const url = ref.location.url;
      try {
        const indexPath = join(ctx.rawDir, 'index.json');
        const indexBytes = await fs.read(indexPath);
        const index = indexBytes
          ? Index.parse(JSON.parse(Buffer.from(indexBytes).toString('utf8')))
          : {};
        const entry = index[url];
        const existing = await fs.read(join(ctx.rawDir, rawFilename(url, entry?.mimeType)));
        if (existing && entry && sha256Hex(existing) !== entry.contentHash)
          throw new AppError('INTERNAL_ERROR', 'Raw cache checksum mismatch.');
        if (existing && (ctx.offline || !ctx.refresh)) {
          ctx.onEvent({ type: 'cached', key: ref.key });
          return {
            bytes: existing,
            mimeType:
              entry?.mimeType ?? MIME_BY_EXTENSION[extname(new URL(url).pathname)] ?? 'text/html',
            fetchedAt: new Date(entry?.fetchedAt ?? ctx.now()),
            contentHash: sha256Hex(existing),
          };
        }
        if (ctx.offline)
          throw new AppError('INTERNAL_ERROR', 'Missing raw source in offline mode.');
        const headers: Record<string, string> = {};
        if (existing && ctx.refresh) {
          if (entry?.etag) headers['If-None-Match'] = entry.etag;
          if (entry?.['last-modified']) headers['If-Modified-Since'] = entry['last-modified'];
        }
        const { response, bytes } = await request(url, headers);
        if (response.status === 304) {
          if (!existing || !entry)
            throw new AppError('INTERNAL_ERROR', 'Not-modified response without cached content.');
          ctx.onEvent({ type: 'cached', key: ref.key });
          return {
            bytes: existing,
            mimeType: entry.mimeType,
            fetchedAt: new Date(entry.fetchedAt),
            contentHash: entry.contentHash,
          };
        }
        const mimeType =
          response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ??
          MIME_BY_EXTENSION[extname(new URL(url).pathname)] ??
          'text/html';
        const contentHash = sha256Hex(bytes);
        const fetchedAt = new Date(ctx.now());
        if (!existing || sha256Hex(existing) !== contentHash || entry?.mimeType !== mimeType)
          await fs.write(join(ctx.rawDir, rawFilename(url, mimeType)), bytes);
        index[url] = {
          url,
          etag: response.headers.get('etag'),
          'last-modified': response.headers.get('last-modified'),
          contentHash,
          mimeType,
          fetchedAt: fetchedAt.toISOString(),
        };
        await fs.write(indexPath, Buffer.from(`${JSON.stringify(index, null, 2)}\n`));
        ctx.onEvent({
          type: existing && sha256Hex(existing) === contentHash ? 'cached' : 'fetched',
          key: ref.key,
        });
        return { bytes, mimeType, fetchedAt, contentHash };
      } catch (cause) {
        const code = cause instanceof AppError ? cause.code : 'INTERNAL_ERROR';
        ctx.onEvent({ type: 'failed', key: ref.key, code });
        throw cause instanceof AppError
          ? cause
          : new AppError(code, 'Cannot load raw source.', { cause });
      }
    });
    tails.set(
      ctx.rawDir,
      operation.catch(() => {}),
    );
    return operation;
  };
}
export type RawCache = ReturnType<typeof createRawCache>;
export function createUrlsDriver(cache: RawCache): SourceDriver<Extract<Source, { type: 'urls' }>> {
  return {
    async *discover(source, ctx) {
      const seen = new Set<string>();
      for (const url of source.urls) {
        const ref = webRef(source, url);
        if (!included(new URL(url).pathname, source) || seen.has(ref.key)) continue;
        seen.add(ref.key);
        ctx.onEvent({ type: 'discovered', key: ref.key });
        yield await Promise.resolve(ref);
      }
    },
    async load(ref, ctx) {
      const raw = await cache(ref, ctx);
      const mimeType = Object.values(MIME_BY_EXTENSION).find((mime) => mime === raw.mimeType);
      if (!mimeType) {
        ctx.onEvent({ type: 'failed', key: ref.key, code: 'UNSUPPORTED_MEDIA_TYPE' });
        throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'Unsupported source content type.');
      }
      return { ...ref, ...raw, mimeType };
    },
  };
}
