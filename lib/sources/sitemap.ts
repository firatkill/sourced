import { XMLParser } from 'fast-xml-parser';
import { z } from 'zod';
import { AppError } from '@/lib/errors';
import { included } from './folder';
import { createUrlsDriver, type RawCache } from './urls';
import { normalizeUrl, webRef, type Source, type SourceDriver } from './types';

const locations = z.array(z.object({ loc: z.string() }));
const Sitemap = z.union([
  z.object({ sitemapindex: z.object({ sitemap: locations.default([]) }) }),
  z.object({ urlset: z.object({ url: locations.default([]) }) }),
]);
export function createSitemapDriver(
  cache: RawCache,
): SourceDriver<Extract<Source, { type: 'sitemap' }>> {
  return {
    async *discover(source, ctx) {
      const origin = new URL(source.url).origin;
      const queue = [{ url: normalizeUrl(source.url), depth: 0 }];
      const visited = new Set<string>();
      const discovered = new Set<string>();
      const parser = new XMLParser({
        ignoreAttributes: true,
        processEntities: true,
        removeNSPrefix: true,
        parseTagValue: false,
        isArray: (name) => name === 'sitemap' || name === 'url',
      });
      while (queue.length) {
        const next = queue.shift();
        if (!next || visited.has(next.url)) continue;
        visited.add(next.url);
        const ref = webRef(source, next.url);
        let bytes: Uint8Array;
        try {
          bytes = (await cache(ref, ctx)).bytes;
        } catch {
          continue;
        }
        const xml = Buffer.from(bytes).toString('utf8');
        if (/<!DOCTYPE/i.test(xml)) {
          ctx.onEvent({ type: 'failed', key: ref.key, code: 'VALIDATION_FAILED' });
          throw new AppError('VALIDATION_FAILED', 'Invalid sitemap XML.');
        }
        // eslint-disable-next-line @typescript-eslint/no-deprecated -- use the validator bundled with the approved XML dependency
        const parsed: unknown = parser.parse(xml, true);
        const sitemap = Sitemap.parse(parsed);
        const index = 'sitemapindex' in sitemap;
        const entries = index ? sitemap.sitemapindex.sitemap : sitemap.urlset.url;
        for (const entry of entries) {
          const url = normalizeUrl(new URL(entry.loc, next.url).href);
          if (new URL(url).origin !== origin) continue;
          if (index) {
            if (next.depth < 3) queue.push({ url, depth: next.depth + 1 });
            continue;
          }
          if (!included(new URL(url).pathname, source) || discovered.has(url)) continue;
          discovered.add(url);
          const document = webRef(source, url);
          ctx.onEvent({ type: 'discovered', key: document.key });
          yield document;
          if (discovered.size >= source.maxPages) {
            ctx.onEvent({ type: 'skipped', key: document.key, reason: 'maxPages reached' });
            return;
          }
        }
      }
    },
    load: (ref, ctx) => createUrlsDriver(cache).load(ref, ctx),
  };
}
