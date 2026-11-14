import { load } from 'cheerio';
import { extname } from 'node:path';
import { included } from './folder';
import { createUrlsDriver, type RawCache } from './urls';
import { normalizeUrl, webRef, type Source, type SourceDriver } from './types';

export function createCrawlDriver(
  cache: RawCache,
): SourceDriver<Extract<Source, { type: 'crawl' }>> {
  const urls = createUrlsDriver(cache);
  return {
    async *discover(source, ctx) {
      const root = new URL(normalizeUrl(source.root));
      const prefix = root.pathname;
      const queue = [{ url: root.href, depth: 0 }];
      const visited = new Set<string>();
      let count = 0;
      while (queue.length) {
        const next = queue.shift();
        if (!next || visited.has(next.url)) continue;
        visited.add(next.url);
        const ref = webRef(source, next.url);
        if (included(new URL(next.url).pathname, source)) {
          ctx.onEvent({ type: 'discovered', key: ref.key });
          yield ref;
          count++;
        }
        if (count >= source.maxPages) {
          ctx.onEvent({ type: 'skipped', key: ref.key, reason: 'maxPages reached' });
          return;
        }
        if (
          next.depth >= source.maxDepth ||
          new URL(next.url).pathname.toLowerCase().endsWith('.pdf')
        )
          continue;
        let raw;
        try {
          raw = await cache(ref, { ...ctx, refresh: false });
        } catch {
          continue;
        }
        if (raw.mimeType !== 'text/html') continue;
        const $ = load(Buffer.from(raw.bytes).toString('utf8'));
        const main =
          source.html.contentSelector ?? 'main, article, [role="main"], #content, .content';
        const content = $(main).length ? $(main) : $('body');
        const links = content.find('a[href]').add($('nav a[href], [role="navigation"] a[href]'));
        for (const anchor of links.toArray()) {
          const node = $(anchor);
          if (
            node
              .attr('rel')
              ?.split(/\s+/)
              .some((rel) => rel.toLowerCase() === 'nofollow')
          )
            continue;
          const href = node.attr('href');
          if (!href) continue;
          let url: URL;
          try {
            url = new URL(normalizeUrl(new URL(href, next.url).href));
          } catch {
            continue;
          }
          if (
            url.origin !== root.origin ||
            !(
              url.pathname === prefix ||
              url.pathname.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`)
            )
          )
            continue;
          const extension = extname(url.pathname).toLowerCase();
          if (extension && !['.html', '.htm', '.pdf'].includes(extension)) continue;
          if (!included(url.pathname, source)) continue;
          queue.push({ url: url.href, depth: next.depth + 1 });
        }
      }
    },
    load: (ref, ctx) => urls.load(ref, ctx),
  };
}
