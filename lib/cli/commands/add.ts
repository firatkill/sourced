import path from 'node:path';
import { z } from 'zod';
import { SourceSchema } from '@/lib/kit/config-schema';
import { loadConfig } from '@/lib/kit/load-config';
import { AppError } from '@/lib/errors';
import type { Invocation, CommandContext } from '../router';
import { saveConfig } from './config-files';

export async function detectSource(
  value: string,
  values: Invocation['values'],
  fetcher: typeof fetch = fetch,
) {
  const web = /^https?:\/\//i.test(value);
  let type =
    typeof values.type === 'string'
      ? values.type
      : web
        ? /\.xml(?:\?|$)/i.test(value)
          ? 'sitemap'
          : 'urls'
        : 'folder';
  let sitemapUrl: string | undefined;
  if (web && !values.type && new URL(value).pathname === '/') {
    const request = async (url: string) => {
      const response = await fetcher(url, { signal: AbortSignal.timeout(10_000) });
      return response.ok ? response.text() : '';
    };
    const candidate = new URL('/sitemap.xml', value).href;
    if (/<(?:\w+:)?(?:urlset|sitemapindex)\b/i.test(await request(candidate)))
      sitemapUrl = candidate;
    else {
      const robots = await request(new URL('/robots.txt', value).href);
      for (const match of robots.matchAll(/^\s*Sitemap:\s*(\S+)/gim)) {
        const parsed = z.url({ protocol: /^https?$/ }).safeParse(match[1]);
        if (parsed.success) {
          sitemapUrl = parsed.data;
          break;
        }
      }
    }
    type = sitemapUrl ? 'sitemap' : 'crawl';
  }
  const id =
    typeof values.id === 'string'
      ? values.id
      : (web ? new URL(value).hostname : path.basename(path.resolve(value)))
          .toLowerCase()
          .replace(/[^a-z0-9-]+/g, '-')
          .slice(0, 40)
          .replace(/^-/, '') || 'source';
  const source = SourceSchema.parse({
    id,
    type,
    ...(values.group ? { group: values.group } : {}),
    ...(values.include ? { include: String(values.include).split(',') } : {}),
    ...(values.exclude ? { exclude: String(values.exclude).split(',') } : {}),
    ...(values['max-pages'] ? { maxPages: Number(values['max-pages']) } : {}),
    ...(values['max-depth'] !== undefined ? { maxDepth: Number(values['max-depth']) } : {}),
    ...(type === 'folder' || type === 'git'
      ? { path: value }
      : type === 'urls'
        ? { urls: [value] }
        : type === 'sitemap'
          ? { url: sitemapUrl ?? value }
          : { root: value }),
  });
  if ((source.type === 'folder' || source.type === 'git') && /[\r\n]/.test(source.path))
    throw new AppError('CONFIG_INVALID', 'Source paths must not contain line breaks.');
  return { source, detected: { type: source.type, ...(sitemapUrl ? { sitemapUrl } : {}) } };
}
export async function runAdd(
  input: Invocation,
  context: CommandContext,
  fetcher: typeof fetch = fetch,
) {
  const config = await loadConfig(process.cwd(), { writeSnapshot: false });
  const value = input.positionals[0];
  if (!value) throw new AppError('VALIDATION_FAILED', 'Provide a URL or path.');
  const result = await detectSource(value, input.values, fetcher);
  if (config.sources.some((s) => s.id === result.source.id))
    throw new AppError('CONFIG_INVALID', 'Choose a unique source id with --id.');
  context.progress(`Detected ${result.detected.type} source.`);
  config.sources.push(result.source);
  await saveConfig(config);
  return result;
}
