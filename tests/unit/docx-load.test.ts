// UT-41 / FR-67, FR-70: dispatcher and warning propagation use production drivers.
import { readFile } from 'node:fs/promises';
import { afterEach, expect, test, vi } from 'vitest';
import { loadCorpus } from '@/lib/ingest/load';
import { KitConfigSchema } from '@/lib/kit/config-schema';
import { cacheFs } from '@/lib/sources/urls';
import fixtureConfig from '../fixtures/kit-tr/sourced.config';

const request = vi.hoisted(() => vi.fn());
vi.mock('@/lib/ingest/fetch', () => ({ createFetchSession: () => request }));
afterEach(() => vi.restoreAllMocks());

test('UT-41: .docx folder dispatch retains path, heading anchors and warning counts', async () => {
  const config = KitConfigSchema.parse({
    ...fixtureConfig,
    sources: [{ id: 'docx', type: 'folder', path: 'tests/fixtures/docx' }],
  });
  const documents = await loadCorpus({
    config,
    offline: true,
    refresh: false,
    includeFixtures: false,
  });
  expect(documents.failedKeys).toEqual([]);
  expect(documents).toHaveLength(5);
  expect(documents.warnings).toBe(1);
  const doc = documents.find((document) => document.slug === 'docx:headings.docx');
  expect(doc).toMatchObject({
    title: 'Garden handbook',
    sourceKind: 'file',
    slug: 'docx:headings.docx',
  });
  expect(doc?.chunks.at(-1)?.anchor).toBe('headings.docx#watering-plants');
  expect(doc?.chunks.at(-1)?.headingPath).toEqual([
    'Garden handbook',
    'Garden handbook',
    'Watering plants',
  ]);
});

test.each([
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'manual'],
  ['text/plain', 'manual.DOCX'],
])('UT-41: DOCX dispatch via %s at %s', async (mime, path) => {
  vi.spyOn(cacheFs, 'read').mockResolvedValue(undefined);
  vi.spyOn(cacheFs, 'write').mockResolvedValue(undefined);
  request.mockResolvedValue({
    response: new Response('', { headers: { 'content-type': mime } }),
    bytes: await readFile('tests/fixtures/docx/properties.docx'),
  });
  const config = KitConfigSchema.parse({
    ...fixtureConfig,
    sources: [{ id: 'web', type: 'urls', urls: [`https://example.test/${path}`] }],
  });
  const documents = await loadCorpus({
    config,
    offline: false,
    refresh: false,
    includeFixtures: false,
  });
  expect(documents.failedKeys).toEqual([]);
  expect(documents).toHaveLength(1);
  expect(documents[0]?.title).toBe('Garden & field handbook');
});
