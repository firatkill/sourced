import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { FETCH } from '@/lib/config';
import { AppError } from '@/lib/errors';
import { sha256Hex } from '@/lib/hash';
import type { Manifest } from './manifest';
import { createRobotsCache } from './robots';

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
  const request = createFetchSession({ fetch: fetchImpl, now, sleep });
  const results: FetchResult[] = [];
  for (const { page, bytes } of existing) {
    try {
      let status: FetchResult['status'] = 'unchanged';
      if (!options.offline && (options.refresh || !bytes)) {
        const result = await request(page.url ?? new URL(page.slug, manifest.baseUrl).href);
        const body = result.bytes;
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

export type FetchClock = {
  fetch: typeof fetch;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
};
/** Shared for one ingest run, including discovery requests and all source contexts. */
export function createFetchSession(ctx: FetchClock) {
  const hosts = new Map<
    string,
    { interval: number; last: number | undefined; tail: Promise<unknown> }
  >();
  const hostState = (url: string) => {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol))
      throw new AppError('VALIDATION_FAILED', 'Web sources require HTTP or HTTPS.');
    let state = hosts.get(parsed.host);
    if (!state) {
      state = { interval: FETCH.MIN_INTERVAL_MS, last: undefined, tail: Promise.resolve() };
      hosts.set(parsed.host, state);
    }
    return state;
  };
  const request = (url: string, headers: Record<string, string> = {}) => {
    const state = hostState(url);
    const pending = state.tail.then(async () => {
      if (state.last !== undefined)
        await ctx.sleep(Math.max(0, state.interval - (ctx.now() - state.last)));
      state.last = ctx.now();
      const response = await ctx.fetch(url, {
        headers: { 'User-Agent': FETCH.USER_AGENT, Accept: 'text/html', ...headers },
        signal: AbortSignal.timeout(FETCH.TIMEOUT_MS),
        redirect: 'manual',
      });
      // Read the body while holding the host queue, so body failures are retried too.
      const bytes = new Uint8Array(await response.arrayBuffer());
      return { response, bytes };
    });
    state.tail = pending.catch(() => {});
    return pending;
  };
  const policies = createRobotsCache(async (url) => {
    const { response, bytes } = await request(url);
    return new Response(response.status === 204 || response.status === 304 ? null : bytes, {
      status: response.status,
      headers: response.headers,
    });
  });
  return async (url: string, headers: Record<string, string> = {}) => {
    const policy = await policies(url);
    hostState(url).interval = policy.intervalMs;
    policy.assertAllowed(url);
    for (let attempt = 0; attempt <= FETCH.MAX_RETRIES; attempt++) {
      let result: Awaited<ReturnType<typeof request>> | undefined;
      let cause: unknown;
      try {
        result = await request(url, headers);
      } catch (error) {
        cause = error;
      }
      if (result && (result.response.ok || result.response.status === 304)) return result;
      const status = result?.response.status;
      if ((status !== undefined && status !== 429 && status < 500) || attempt === FETCH.MAX_RETRIES)
        throw new AppError('INTERNAL_ERROR', 'Source fetch failed.', { cause });
      const retryAfter = result?.response.headers.get('retry-after');
      const seconds = Number(retryAfter ?? 0);
      const delay = Number.isFinite(seconds)
        ? seconds * 1000
        : Date.parse(retryAfter ?? '') - ctx.now();
      await ctx.sleep(
        Math.max(FETCH.RETRY_DELAYS_MS[attempt] ?? 0, Number.isFinite(delay) ? delay : 0),
      );
    }
    throw new AppError('INTERNAL_ERROR', 'Source fetch failed.');
  };
}
