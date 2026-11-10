import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { FETCH } from '@/lib/config';
import { AppError } from '@/lib/errors';
import { sha256Hex } from '@/lib/hash';
import type { Manifest } from './manifest';
import { loadRobots } from './robots';

type FetchResult = { slug: string; status: 'fetched' | 'unchanged' };
type FetchOptions = {
  rawDir?: string;
  offline?: boolean;
  refresh?: boolean;
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  onStatus?: (slug: string, status: FetchResult['status'] | 'failed') => void;
};

async function cached(path: string): Promise<Buffer | undefined> {
  try {
    return await readFile(path);
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return undefined;
    throw new AppError('INTERNAL_ERROR', 'Cannot read cached corpus page.', { cause });
  }
}

export async function fetchRawPages(
  manifest: Manifest,
  options: FetchOptions = {},
): Promise<FetchResult[]> {
  const cachePath = (page: Manifest['pages'][number]) => {
    if (options.rawDir) return join(options.rawDir, page.slug);
    if (page.path) return page.path;
    throw new AppError('VALIDATION_FAILED', 'Missing raw cache path.');
  };
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => setTimeout(ms));
  const existing = await Promise.all(
    manifest.pages.map(async (page) => ({ page, bytes: await cached(cachePath(page)) })),
  );
  if (options.offline && existing.some((entry) => !entry.bytes))
    throw new AppError('INTERNAL_ERROR', 'Missing raw corpus page in offline mode.');
  let interval: number = FETCH.MIN_INTERVAL_MS;
  let lastStart: number | undefined;
  const request = async (url: string) => {
    if (lastStart !== undefined) await sleep(Math.max(0, interval - (now() - lastStart)));
    lastStart = now();
    return fetchImpl(url, {
      headers: { 'User-Agent': FETCH.USER_AGENT, Accept: 'text/html' },
      signal: AbortSignal.timeout(FETCH.TIMEOUT_MS),
    });
  };
  const needsFetch = !options.offline && existing.some((entry) => options.refresh || !entry.bytes);
  const robots = needsFetch ? await loadRobots(manifest.baseUrl, request) : undefined;
  if (robots) {
    interval = robots.intervalMs;
    for (const { page } of existing)
      robots.assertAllowed(page.url ?? new URL(page.slug, manifest.baseUrl).href);
  }
  const results: FetchResult[] = [];
  for (const { page, bytes } of existing) {
    try {
      let status: FetchResult['status'] = 'unchanged';
      if (!options.offline && (options.refresh || !bytes)) {
        let body: Buffer | undefined;
        for (let attempt = 0; attempt <= FETCH.MAX_RETRIES; attempt++) {
          let response: Response | undefined;
          let cause: unknown;
          try {
            response = await request(page.url ?? new URL(page.slug, manifest.baseUrl).href);
            if (response.ok) {
              body = Buffer.from(await response.arrayBuffer());
              break;
            }
          } catch (error) {
            cause = error;
            response = undefined;
          }
          const retryable = !response || response.status === 429 || response.status >= 500;
          if (!retryable || attempt === FETCH.MAX_RETRIES)
            throw new AppError('INTERNAL_ERROR', `Corpus fetch failed: ${page.slug}`, { cause });
          const retryAfter = response?.headers.get('retry-after');
          const seconds = retryAfter ? Number(retryAfter) : 0;
          const headerDelay = Number.isFinite(seconds)
            ? seconds * 1000
            : Math.max(0, Date.parse(retryAfter ?? '') - now());
          await sleep(
            Math.max(
              FETCH.RETRY_DELAYS_MS[attempt] ?? 0,
              Number.isFinite(headerDelay) ? headerDelay : 0,
            ),
          );
        }
        if (!body) throw new AppError('INTERNAL_ERROR', `Corpus fetch failed: ${page.slug}`);
        if (!bytes || sha256Hex(bytes) !== sha256Hex(body)) {
          await mkdir(dirname(cachePath(page)), { recursive: true });
          await writeFile(cachePath(page), body);
          status = 'fetched';
        }
      }
      results.push({ slug: page.slug, status });
      options.onStatus?.(page.slug, status);
    } catch (cause) {
      options.onStatus?.(page.slug, 'failed');
      throw cause instanceof AppError
        ? cause
        : new AppError('INTERNAL_ERROR', `Corpus fetch failed: ${page.slug}`, { cause });
    }
  }
  return results;
}
