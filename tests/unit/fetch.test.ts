import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import manifest from '@/corpus/manifest.json';
import { FETCH } from '@/lib/config';
import { fetchRawPages } from '@/lib/ingest/fetch';
import { ManifestSchema } from '@/lib/ingest/manifest';

const dirs: string[] = [];
async function setup() {
  const rawDir = await mkdtemp(join(tmpdir(), 'sourced-fetch-'));
  dirs.push(rawDir);
  let time = 0;
  const starts: number[] = [];
  const sleep = vi.fn((ms: number) => {
    time += ms;
    return Promise.resolve();
  });
  const replies: (Response | Error)[] = [];
  const fetchImpl = vi.fn<typeof fetch>((_url, options) => {
    starts.push(time);
    expect(options?.headers).toEqual({ 'User-Agent': FETCH.USER_AGENT, Accept: 'text/html' });
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    const next = replies.shift();
    if (!next) throw new Error('Unexpected fetch');
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
  return { rawDir, starts, replies, fetchImpl, sleep, now: () => time };
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
const page = { ...ManifestSchema.parse(manifest), pages: [manifest.pages[0]!] };

test('TC-033: UT-30 robots disallow and unavailable policy abort; 404 allows', async () => {
  for (const reply of [
    new Response('User-agent: *\nDisallow: /docs/'),
    new Response('', { status: 503 }),
    new Error('offline'),
  ]) {
    const ctx = await setup();
    ctx.replies.push(reply);
    await expect(fetchRawPages(page, ctx)).rejects.toThrow();
    expect(ctx.fetchImpl).toHaveBeenCalledTimes(1);
  }
  const ctx = await setup();
  ctx.replies.push(new Response('', { status: 404 }), new Response('content'));
  expect(await fetchRawPages(page, ctx)).toEqual([
    { slug: page.pages[0]!.slug, status: 'fetched' },
  ]);
});

test('TC-034: UT-30 requests are sequential, respect crawl delay and retry delays', async () => {
  const ctx = await setup();
  ctx.replies.push(
    new Response('User-agent: *\nCrawl-delay: 3'),
    new Response('', { status: 429, headers: { 'Retry-After': '7' } }),
    new Response('', { status: 503 }),
    new Error('network'),
    new Response('ok'),
  );
  await fetchRawPages(page, ctx);
  expect(ctx.starts).toEqual([0, 3000, 10000, 25000, 70000]);
  expect(ctx.fetchImpl).toHaveBeenCalledTimes(5);
  const fatal = await setup();
  fatal.replies.push(new Response(''), new Response('', { status: 403 }));
  await expect(fetchRawPages(page, fatal)).rejects.toThrow();
  expect(fatal.fetchImpl).toHaveBeenCalledTimes(2);
  const exhausted = await setup();
  exhausted.replies.push(
    new Response(''),
    ...Array.from({ length: 4 }, () => new Response('', { status: 500 })),
  );
  await expect(fetchRawPages(page, exhausted)).rejects.toThrow();
  expect(exhausted.fetchImpl).toHaveBeenCalledTimes(5);
});

test('TC-035: UT-30 cache and offline paths never fetch; refresh preserves unchanged bytes and mtime', async () => {
  const ctx = await setup();
  const path = join(ctx.rawDir, page.pages[0]!.slug);
  const bytes = Buffer.from('<p>PostgreSQL © text</p>');
  await writeFile(path, bytes);
  const before = await stat(path);
  expect(await fetchRawPages(page, { ...ctx, offline: true })).toEqual([
    { slug: page.pages[0]!.slug, status: 'unchanged' },
  ]);
  await fetchRawPages(page, ctx);
  expect(ctx.fetchImpl).not.toHaveBeenCalled();
  ctx.replies.push(new Response(''), new Response(bytes));
  await fetchRawPages(page, { ...ctx, refresh: true });
  expect(await readFile(path)).toEqual(bytes);
  expect((await stat(path)).mtimeMs).toBe(before.mtimeMs);
  const missing = await setup();
  await expect(fetchRawPages(page, { ...missing, offline: true })).rejects.toThrow();
  expect(missing.fetchImpl).not.toHaveBeenCalled();
});

test('TC-034: UT-30 response-body network failure and HTTP-date Retry-After are retried', async () => {
  const ctx = await setup();
  const broken = new Response(
    new ReadableStream({
      start(controller) {
        controller.error(new Error('body interrupted'));
      },
    }),
  );
  ctx.replies.push(
    new Response(''),
    broken,
    new Response('', { status: 429, headers: { 'Retry-After': new Date(30000).toUTCString() } }),
    new Response('complete'),
  );
  await fetchRawPages(page, ctx);
  expect(ctx.starts).toEqual([0, 2000, 7000, 30000]);
});
