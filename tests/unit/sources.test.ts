import { expect, test, vi } from 'vitest';
import { SourceSchema } from '@/lib/kit/config-schema';
import { FETCH } from '@/lib/config';
import { createFetchSession } from '@/lib/ingest/fetch';
import { createFolderDriver, type FolderFs } from '@/lib/sources/folder';
import { createGitDriver } from '@/lib/sources/git';
import { createRawCache, createUrlsDriver, rawFilename, type CacheFs } from '@/lib/sources/urls';
import { createSitemapDriver } from '@/lib/sources/sitemap';
import { createCrawlDriver } from '@/lib/sources/crawl';
import {
  normalizeUrl,
  normalizePath,
  locationSlug,
  sourceLocationSlug,
  webRef,
  type SourceContext,
  type SourceEvent,
} from '@/lib/sources/types';

function setup() {
  let time = 0;
  const events: SourceEvent[] = [];
  const calls: { url: string; time: number; headers: Headers }[] = [];
  const responses = new Map<string, (Response | Error)[]>();
  const fetcher = vi.fn<typeof fetch>((input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    calls.push({ url, time, headers: new Headers(init?.headers) });
    expect(init?.redirect).toBe('manual');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const response = responses.get(url)?.shift();
    if (!response) throw new Error(`Unexpected request ${url}`);
    if (response instanceof Error) throw response;
    return Promise.resolve(response);
  });
  const ctx: SourceContext = {
    repoRoot: '/repo',
    rawDir: '/raw/docs',
    offline: false,
    refresh: false,
    fetch: fetcher,
    now: () => time,
    sleep: (ms) => {
      time += ms;
      return Promise.resolve();
    },
    onEvent: (event) => events.push(event),
  };
  const files = new Map<string, Uint8Array>();
  const fs: CacheFs = {
    read: (path) => Promise.resolve(files.get(path)),
    write: vi.fn<CacheFs['write']>((path, bytes) => {
      files.set(path, bytes);
      return Promise.resolve();
    }),
  };
  const request = createFetchSession(ctx);
  const cache = createRawCache(request, fs);
  return { ctx, events, calls, responses, fetcher, files, fs, request, cache };
}
const collect = async <T>(iterable: AsyncIterable<T>) => {
  const all: T[] = [];
  for await (const item of iterable) all.push(item);
  return all;
};
const source = SourceSchema.parse({
  id: 'docs',
  type: 'urls',
  urls: ['https://a.test/docs/a.html'],
});

test('UT-34 / FR-65: stable normalized URLs and case-preserving relative POSIX keys', () => {
  expect(normalizeUrl('https://a.test/docs/index.html?z=2&a=1#part')).toBe(
    'https://a.test/docs/?a=1&z=2',
  );
  expect(normalizeUrl('https://a.test/myindex.html')).toBe('https://a.test/myindex.html');
  expect(normalizePath('.\\Manual\\a\\..\\Case.md')).toBe('Manual/Case.md');
  expect(locationSlug({ kind: 'web', url: 'https://a.test/docs/index.html?q=1' }, '/docs/')).toBe(
    'index?q=1',
  );
  expect(locationSlug({ kind: 'file', path: 'Manual/Case.md' }, 'Manual')).toBe('Case.md');
  expect(webRef(source, 'https://a.test/docs/a.html#x').key).toBe(
    'docs:https://a.test/docs/a.html',
  );
});

test('UT-35 / FR-65: folder include/exclude, recursive skips, MIME mapping and byte hashes using memory fs', async () => {
  const ctx = setup();
  const paths = [
    'a.md',
    'b.mdx',
    'c.html',
    'd.htm',
    'e.pdf',
    'f.docx',
    'g.txt',
    'skip.txt',
    'image.png',
    'huge.md',
    '.hidden.md',
    'node_modules',
  ];
  const fs: FolderFs = {
    entries: (path) =>
      Promise.resolve(
        path === '/repo/manual'
          ? paths.map((name) => ({
              name,
              file: name !== 'node_modules',
              directory: name === 'node_modules',
            }))
          : [],
      ),
    size: (path) => Promise.resolve(path.endsWith('huge.md') ? 50 * 1024 * 1024 + 1 : 4),
    read: () => Promise.resolve(Buffer.from('body')),
  };
  const driver = createFolderDriver(fs);
  const input = SourceSchema.parse({
    id: 'docs',
    type: 'folder',
    path: 'manual',
    include: ['**/*'],
    exclude: ['skip.txt'],
  });
  if (input.type !== 'folder') throw new Error('fixture');
  const refs = await collect(driver.discover(input, ctx.ctx));
  expect(refs.map((ref) => ref.key)).toEqual([
    'docs:a.md',
    'docs:b.mdx',
    'docs:c.html',
    'docs:d.htm',
    'docs:e.pdf',
    'docs:f.docx',
    'docs:g.txt',
  ]);
  const docs = await Promise.all(refs.map((ref) => driver.load(ref, ctx.ctx)));
  expect(docs.map((doc) => doc.mimeType)).toEqual([
    'text/markdown',
    'text/mdx',
    'text/html',
    'text/html',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
  ]);
  expect(
    docs.every(
      (doc) =>
        doc.contentHash === '230d8358dc8e8890b4c58deeb62912ee2f20357ae92a5cc861b98e68fe31acb5',
    ),
  ).toBe(true);
  expect(ctx.events.filter((event) => event.type === 'skipped')).toHaveLength(4);
  expect(ctx.fetcher).not.toHaveBeenCalled();
  const glob = { ...input, path: 'manual/*.md', include: [] };
  expect((await collect(driver.discover(glob, ctx.ctx))).map((ref) => ref.key)).toEqual([
    'docs:a.md',
  ]);
});

test('UT-35 / FR-65 / D-101: Git uses only local HEAD and subdirectory, reporting revision', async () => {
  const ctx = setup();
  const entries = vi
    .fn<FolderFs['entries']>()
    .mockResolvedValue([{ name: 'a.txt', file: true, directory: false }]);
  const revision = vi.fn().mockResolvedValue('a'.repeat(40));
  const driver = createGitDriver(
    { entries, size: () => Promise.resolve(1), read: () => Promise.resolve(Buffer.from('x')) },
    revision,
  );
  const source = SourceSchema.parse({ id: 'git', type: 'git', path: 'checkout', subdir: 'docs' });
  if (source.type !== 'git') throw new Error('fixture');
  expect((await collect(driver.discover(source, ctx.ctx)))[0]?.key).toBe('git:a.txt');
  expect(revision).toHaveBeenCalledWith('/repo/checkout');
  expect(entries).toHaveBeenCalledWith('/repo/checkout/docs');
  expect(ctx.events).toContainEqual({
    type: 'revision',
    key: 'git:',
    sourceId: 'git',
    revision: 'a'.repeat(40),
  });
  await expect(
    collect(driver.discover({ ...source, subdir: '../outside' }, ctx.ctx)),
  ).rejects.toThrow();
  expect(ctx.fetcher).not.toHaveBeenCalled();
});

test('UT-37 / FR-66: independent hosts, once-per-run robots, larger Crawl-delay, and sequential requests', async () => {
  const ctx = setup();
  ctx.responses.set('https://a.test/robots.txt', [new Response('User-agent: *\nCrawl-delay: 3')]);
  ctx.responses.set('https://b.test/robots.txt', [new Response('', { status: 404 })]);
  for (const url of ['https://a.test/1', 'https://a.test/2', 'https://b.test/1'])
    ctx.responses.set(url, [new Response('ok')]);
  await ctx.request('https://a.test/1');
  await ctx.request('https://b.test/1');
  await ctx.request('https://a.test/2');
  expect(ctx.calls.map(({ url, time }) => [url, time])).toEqual([
    ['https://a.test/robots.txt', 0],
    ['https://a.test/1', 3000],
    ['https://b.test/robots.txt', 3000],
    ['https://b.test/1', 5000],
    ['https://a.test/2', 6000],
  ]);
  expect(ctx.calls.every((call) => call.headers.get('user-agent') === FETCH.USER_AGENT)).toBe(true);
});

test('UT-37 / FR-66: unavailable/disallow robots fails closed and is cached, while 404 permits', async () => {
  for (const response of [
    new Response('', { status: 503 }),
    new Error('network'),
    new Response('User-agent: *\nDisallow: /'),
  ]) {
    const ctx = setup();
    ctx.responses.set('https://a.test/robots.txt', [response]);
    await expect(ctx.request('https://a.test/x')).rejects.toThrow();
    await expect(ctx.request('https://a.test/y')).rejects.toThrow();
    expect(ctx.fetcher).toHaveBeenCalledTimes(1);
  }
});

test('UT-37 / FR-66: cache, conditional refresh, unchanged bytes, offline missing failure and continuation', async () => {
  const ctx = setup();
  const driver = createUrlsDriver(ctx.cache);
  const ref = webRef(source, 'https://a.test/docs/a.html');
  ctx.responses.set('https://a.test/robots.txt', [new Response('', { status: 404 })]);
  ctx.responses.set('https://a.test/docs/a.html', [
    new Response('body', {
      headers: {
        ETag: 'v1',
        'Last-Modified': 'Wed, 01 Jan 2025 00:00:00 GMT',
        'Content-Type': 'text/html',
      },
    }),
    new Response(null, { status: 304 }),
  ]);
  const first = await driver.load(ref, ctx.ctx);
  const writes = vi.mocked(ctx.fs.write).mock.calls.length;
  expect(await driver.load(ref, { ...ctx.ctx, refresh: true })).toEqual(first);
  expect(ctx.calls.at(-1)?.headers.get('if-none-match')).toBe('v1');
  expect(ctx.calls.at(-1)?.headers.get('if-modified-since')).toBe('Wed, 01 Jan 2025 00:00:00 GMT');
  expect(vi.mocked(ctx.fs.write)).toHaveBeenCalledTimes(writes);
  expect(await driver.load(ref, { ...ctx.ctx, offline: true })).toEqual(first);
  await expect(
    driver.load(webRef(source, 'https://a.test/missing'), { ...ctx.ctx, offline: true }),
  ).rejects.toThrow('offline');
  expect(await driver.load(ref, { ...ctx.ctx, offline: true })).toEqual(first);
  expect(ctx.fetcher).toHaveBeenCalledTimes(3);
  expect(
    ctx.files.has(`/raw/docs/${rawFilename(ref.location.kind === 'web' ? ref.location.url : '')}`),
  ).toBe(true);
  expect(ctx.events).toContainEqual({
    type: 'failed',
    key: 'docs:https://a.test/missing',
    code: 'INTERNAL_ERROR',
  });
});

test('UT-36 / FR-65: sitemap index nesting, origin/filter limits, cap, offline replay', async () => {
  const ctx = setup();
  ctx.responses.set('https://a.test/robots.txt', [new Response('')]);
  ctx.responses.set('https://a.test/map.xml', [
    new Response(
      '<sitemapindex><sitemap><loc>https://a.test/child.xml</loc></sitemap><sitemap><loc>https://b.test/map.xml</loc></sitemap></sitemapindex>',
    ),
  ]);
  ctx.responses.set('https://a.test/child.xml', [
    new Response(
      '<urlset><url><loc>https://a.test/docs/a</loc></url><url><loc>https://b.test/docs/b</loc></url><url><loc>https://a.test/no</loc></url><url><loc>https://a.test/docs/c</loc></url></urlset>',
    ),
  ]);
  const input = SourceSchema.parse({
    id: 'docs',
    type: 'sitemap',
    url: 'https://a.test/map.xml',
    include: ['/docs/**'],
    maxPages: 1,
  });
  if (input.type !== 'sitemap') throw new Error('fixture');
  const driver = createSitemapDriver(ctx.cache);
  const refs = await collect(driver.discover(input, ctx.ctx));
  expect(refs.map((ref) => ref.key)).toEqual(['docs:https://a.test/docs/a']);
  expect(ctx.events).toContainEqual({
    type: 'skipped',
    key: refs[0]!.key,
    reason: 'maxPages reached',
  });
  expect(await collect(driver.discover(input, { ...ctx.ctx, offline: true }))).toEqual(refs);
  expect(ctx.fetcher).toHaveBeenCalledTimes(3);
});

test('UT-36 / FR-65: crawl BFS main/nav links, nofollow, origin and path boundary, filters/depth/caps', async () => {
  const ctx = setup();
  ctx.responses.set('https://a.test/robots.txt', [new Response('')]);
  ctx.responses.set('https://a.test/docs/', [
    new Response(
      '<main><a href="a.html">A</a><a href="b.pdf">PDF</a><a href="skip" rel="nofollow">skip</a><a href="/docs-other/a">outside</a><a href="https://b.test/docs/a">external</a><a href="x.png">image</a><a href="excluded.html">excluded</a></main><nav><a href="nav.html">nav</a></nav>',
      { headers: { 'Content-Type': 'text/html' } },
    ),
  ]);
  const input = SourceSchema.parse({
    id: 'docs',
    type: 'crawl',
    root: 'https://a.test/docs/',
    maxDepth: 1,
    exclude: ['**/excluded.html'],
  });
  if (input.type !== 'crawl') throw new Error('fixture');
  const driver = createCrawlDriver(ctx.cache);
  expect((await collect(driver.discover(input, ctx.ctx))).map((ref) => ref.key)).toEqual([
    'docs:https://a.test/docs/',
    'docs:https://a.test/docs/a.html',
    'docs:https://a.test/docs/b.pdf',
    'docs:https://a.test/docs/nav.html',
  ]);
  expect(ctx.fetcher).toHaveBeenCalledTimes(2);
  expect(await collect(driver.discover({ ...input, maxPages: 1 }, ctx.ctx))).toHaveLength(1);
  expect(await collect(driver.discover({ ...input, maxDepth: 0 }, ctx.ctx))).toHaveLength(1);
});

test('UT-36 / FR-65: sitemap indexes stop after three nesting levels and deduplicate cycles', async () => {
  const ctx = setup();
  ctx.responses.set('https://a.test/robots.txt', [new Response('')]);
  for (let i = 0; i < 4; i++)
    ctx.responses.set(`https://a.test/${String(i)}.xml`, [
      new Response(
        `<sitemapindex><sitemap><loc>https://a.test/${String(i + 1)}.xml</loc></sitemap><sitemap><loc>https://a.test/0.xml</loc></sitemap></sitemapindex>`,
      ),
    ]);
  const input = SourceSchema.parse({ id: 'docs', type: 'sitemap', url: 'https://a.test/0.xml' });
  if (input.type !== 'sitemap') throw new Error('fixture');
  expect(await collect(createSitemapDriver(ctx.cache).discover(input, ctx.ctx))).toEqual([]);
  expect(ctx.calls.map((call) => call.url)).toEqual([
    'https://a.test/robots.txt',
    'https://a.test/0.xml',
    'https://a.test/1.xml',
    'https://a.test/2.xml',
    'https://a.test/3.xml',
  ]);
});

test('UT-37 / FR-66: concurrent requests on one host wait for the previous response and interval', async () => {
  const ctx = setup();
  ctx.responses.set('https://a.test/robots.txt', [new Response('')]);
  for (const path of ['a', 'b', 'c'])
    ctx.responses.set(`https://a.test/${path}`, [new Response(path)]);
  await Promise.all(['a', 'b', 'c'].map((path) => ctx.request(`https://a.test/${path}`)));
  expect(ctx.calls.map((call) => call.time)).toEqual([0, 2000, 4000, 6000]);
});

test('UT-37 / FR-66: failed offline load continues to other cache entries without any request', async () => {
  const ctx = setup();
  const driver = createUrlsDriver(ctx.cache);
  ctx.files.set(`/raw/docs/${rawFilename('https://a.test/good.html')}`, Buffer.from('ok'));
  await expect(
    driver.load(webRef(source, 'https://a.test/missing.html'), { ...ctx.ctx, offline: true }),
  ).rejects.toThrow();
  expect(
    (await driver.load(webRef(source, 'https://a.test/good.html'), { ...ctx.ctx, offline: true }))
      .bytes,
  ).toEqual(Buffer.from('ok'));
  expect(ctx.fetcher).not.toHaveBeenCalled();
});

test('UT-35 / FR-65: nested files have root-relative keys and literal file paths load without a directory walk error', async () => {
  const ctx = setup();
  const entries: FolderFs['entries'] = (path) => {
    if (path.endsWith('.md'))
      return Promise.reject(Object.assign(new Error('not directory'), { code: 'ENOTDIR' }));
    return Promise.resolve(
      path === '/repo/manual'
        ? [{ name: 'Section', directory: true, file: false }]
        : [{ name: 'Case.md', directory: false, file: true }],
    );
  };
  const driver = createFolderDriver({
    entries,
    size: () => Promise.resolve(4),
    read: () => Promise.resolve(Buffer.from('body')),
  });
  const source = SourceSchema.parse({ id: 'docs', type: 'folder', path: 'manual' });
  if (source.type !== 'folder') throw new Error('fixture');
  const nested = (await collect(driver.discover(source, ctx.ctx)))[0]!;
  expect(nested.key).toBe('docs:Section/Case.md');
  expect(sourceLocationSlug(nested, source)).toBe('Section/Case.md');
  expect(
    (await collect(driver.discover({ ...source, path: 'manual/Section/Case.md' }, ctx.ctx)))[0]
      ?.key,
  ).toBe('docs:Case.md');
});

test('UT-34 / FR-65: URL discovery filters path globs and deduplicates normalized identities', async () => {
  const ctx = setup();
  const source = SourceSchema.parse({
    id: 'docs',
    type: 'urls',
    urls: [
      'https://a.test/docs/a.html#one',
      'https://a.test/docs/a.html#two',
      'https://a.test/outside.html',
      'https://a.test/docs/excluded.html',
    ],
    include: ['/docs/**'],
    exclude: ['**/excluded.html'],
  });
  if (source.type !== 'urls') throw new Error('fixture');
  expect(
    (await collect(createUrlsDriver(ctx.cache).discover(source, ctx.ctx))).map((ref) => ref.key),
  ).toEqual(['docs:https://a.test/docs/a.html']);
  expect(ctx.fetcher).not.toHaveBeenCalled();
});

test('UT-34 / D-128: source-relative slugs retain nested paths and normalized queries', () => {
  const sitemap = SourceSchema.parse({
    id: 'manual',
    type: 'sitemap',
    url: 'https://a.test/manual/sitemap.xml',
  });
  for (const [path, slug] of [
    ['a/', 'a'],
    ['b/', 'b'],
    ['', 'index'],
    ['core/indexes/create-index/', 'core/indexes/create-index'],
    ['index.html?z=2&a=1#part', 'index?a=1&z=2'],
  ] as const) {
    expect(sourceLocationSlug(webRef(sitemap, `https://a.test/manual/${path}`), sitemap)).toBe(
      slug,
    );
  }
  const urls = SourceSchema.parse({
    id: 'manual',
    type: 'urls',
    urls: [
      'https://a.test/manual/a/',
      'https://a.test/manual/b/',
      'https://a.test/manual/core/indexes/',
    ],
    include: ['/manual/a/**'],
  });
  expect(sourceLocationSlug(webRef(urls, 'https://a.test/manual/a/'), urls)).toBe('a');
  expect(sourceLocationSlug(webRef(urls, 'https://a.test/manual/core/indexes/'), urls)).toBe(
    'core/indexes',
  );
  const crawl = SourceSchema.parse({ id: 'manual', type: 'crawl', root: 'https://a.test/manual/' });
  expect(sourceLocationSlug(webRef(crawl, 'https://a.test/manual/'), crawl)).toBe('index');
  expect(sourceLocationSlug(webRef(crawl, 'https://a.test/manual/core/indexes/'), crawl)).toBe(
    'core/indexes',
  );
  expect(locationSlug({ kind: 'file', path: 'docs/guide.md' }, 'docs')).toBe('guide.md');
  expect(locationSlug({ kind: 'file', path: 'docs/core/guide.md' }, 'docs')).toBe('core/guide.md');
});
