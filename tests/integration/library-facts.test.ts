// T-80 / REDESIGN-v2 §3.3 and §5: library facts and GET /api/library.
import { beforeEach, expect, test } from 'vitest';
import { GET, runtime, dynamic } from '@/app/api/library/route';
import { getSql } from '@/lib/db/client';
import { getLibraryFacts } from '@/lib/library/facts';

const hash = (n: number) => n.toString(16).padStart(64, '0');
async function insertDocument(
  slug: string,
  url: string,
  sourceId: string | null,
  kind: string | null,
  fixture = false,
) {
  await getSql()`INSERT INTO documents
    (slug, url, title, version, section, source_id, source_kind, content_hash, is_fixture, fetched_at)
    VALUES (${slug}, ${url}, ${slug}, '1', 'test', ${sourceId}, ${kind},
      ${hash(slug.length + url.length)}, ${fixture}, now())`;
}

beforeEach(async () => {
  await getSql()`TRUNCATE documents, chunks, ingest_runs CASCADE`;
});

test('empty library: no documents, no sources, never ingested', async () => {
  expect(await getLibraryFacts()).toEqual({ documents: 0, sources: [], lastIngestAt: null });
});

test('counts real documents, labels folders and hosts, and uses the last successful run', async () => {
  await insertDocument('a', '/home/me/contracts/a.pdf', 'contracts', 'file');
  await insertDocument('b', '/home/me/contracts/b.pdf', 'contracts', 'file');
  await insertDocument('c', '/home/me/handbook/c.md', 'handbook', 'file');
  await insertDocument('d', 'https://www.example.com/docs/d', 'site', 'web');
  await insertDocument('e', 'https://docs.example.org:8443/e?x=1', null, null);
  await insertDocument('fixture', 'https://fixture.test/f', 'fixtures', 'web', true);
  await getSql()`INSERT INTO ingest_runs (status, finished_at, include_fixtures, embedding_model)
    VALUES ('succeeded', '2026-11-19T08:00:00Z', false, 'mock'),
      ('succeeded', '2026-11-20T09:30:00Z', false, 'mock'),
      ('failed', '2026-11-20T11:00:00Z', false, 'mock')`;
  expect(await getLibraryFacts()).toEqual({
    documents: 5,
    sources: ['contracts/', 'handbook/', 'docs.example.org', 'example.com'],
    lastIngestAt: '2026-11-20T09:30:00.000Z',
  });
});

test('GET /api/library returns the facts without caching', async () => {
  await insertDocument('a', '/home/me/notes/a.md', 'notes', 'file');
  const response = await GET(new Request('http://localhost/api/library'));
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(await response.json()).toEqual({ documents: 1, sources: ['notes/'], lastIngestAt: null });
  expect(runtime).toBe('nodejs');
  expect(dynamic).toBe('force-dynamic');
});
