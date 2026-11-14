// TC-199 / UT-39 / FR-67, FR-69: production drivers dispatch by format.
import { readFile } from 'node:fs/promises';
import { afterEach, expect, test, vi } from 'vitest';
import { loadCorpus } from '@/lib/ingest/load';
import { KitConfigSchema } from '@/lib/kit/config-schema';
import { cacheFs } from '@/lib/sources/urls';
import fixtureConfig from '../fixtures/kit-tr/sourced.config';

const request = vi.hoisted(() => vi.fn());
vi.mock('@/lib/ingest/fetch', () => ({ createFetchSession: () => request }));
afterEach(() => vi.restoreAllMocks());

test('UT-39: folder .md and .mdx are parsed through the production dispatcher', async () => {
  const config = KitConfigSchema.parse({
    ...fixtureConfig,
    sources: [{ id: 'markdown', type: 'folder', path: 'tests/fixtures/markdown' }],
  });
  const documents = await loadCorpus({
    config,
    offline: true,
    refresh: false,
    includeFixtures: false,
  });
  expect(documents.failedKeys).toEqual([]);
  expect(documents).toHaveLength(9);
  const mdx = documents.find((doc) => doc.slug === 'markdown:components.mdx');
  expect(mdx).toMatchObject({
    title: 'Component guide',
    sourceKind: 'file',
    mimeType: 'text/mdx',
    locationSlug: 'components.mdx',
  });
  expect(mdx?.chunks.map((c) => c.content).join('\n')).toContain('visible badge');
  expect(mdx?.chunks.every((c) => c.anchor.startsWith('components.mdx#'))).toBe(true);
});

test.each([
  ['text/markdown', 'plain.md', 'Field guide', 'visible-heading'],
  ['text/mdx', 'components.mdx', 'Component guide', 'nested-heading'],
])(
  'UT-39 / D-101: web %s without a file extension preserves URL, location slug and anchors',
  async (mime, file, title, anchor) => {
    vi.spyOn(cacheFs, 'read').mockResolvedValue(undefined);
    vi.spyOn(cacheFs, 'write').mockResolvedValue(undefined);
    request.mockResolvedValue({
      response: new Response('', { headers: { 'content-type': `${mime}; charset=utf-8` } }),
      bytes: await readFile(`tests/fixtures/markdown/${file}`),
    });
    const url = 'https://example.test/manual';
    const config = KitConfigSchema.parse({
      ...fixtureConfig,
      sources: [{ id: 'web', type: 'urls', urls: [url] }],
    });
    const documents = await loadCorpus({
      config,
      offline: false,
      refresh: false,
      includeFixtures: false,
    });
    expect(documents.failedKeys).toEqual([]);
    expect(documents).toHaveLength(1);
    expect(documents[0]).toMatchObject({
      slug: `web:${url}`,
      url,
      title,
      locationSlug: 'manual',
      sourceKind: 'web',
      mimeType: mime,
    });
    expect(documents[0]?.chunks.at(-1)?.anchor).toBe(`manual#${anchor}`);
  },
);
