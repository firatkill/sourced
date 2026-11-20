// T-84 / REDESIGN-v2 §5: GET and HEAD /api/files/chunk/:chunkId.
import path from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { GET, HEAD } from '@/app/api/files/chunk/[chunkId]/route';
import { getSql } from '@/lib/db/client';
import * as profile from '@/lib/kit/profile';
import * as runtime from '@/lib/kit/runtime-config';

const folder = 'tests/fixtures/mixed-folder';
const params = (chunkId: string) => ({ params: Promise.resolve({ chunkId }) });
const request = (method = 'GET') => new Request('http://localhost/api/files/chunk/x', { method });

async function insertChunk(url: string, kind: string) {
  const sql = getSql();
  const [document] = await sql<{ id: string }[]>`INSERT INTO documents
    (slug, url, title, version, section, source_id, source_kind, content_hash, fetched_at)
    VALUES (${`docs:${path.basename(url)}`}, ${url}, 'Guide', '1', 'docs', 'docs', ${kind},
      ${'c'.repeat(64)}, now()) RETURNING id::text`;
  const [chunk] = await sql<{ id: string }[]>`INSERT INTO chunks
    (document_id, ordinal, heading_path, anchor, content, token_count, content_hash, embedding_model, embedding)
    VALUES (${document?.id ?? ''}::bigint, 0, ARRAY['Guide'], 'guide#root', 'Guide passage', 2,
      ${'d'.repeat(64)}, 'mock', ${JSON.stringify(Array<number>(1536).fill(0))}::vector)
    RETURNING id::text`;
  return chunk?.id ?? '';
}

beforeEach(async () => {
  await getSql()`TRUNCATE documents, chunks CASCADE`;
  vi.spyOn(profile, 'isPublicDemo').mockReturnValue(false);
  const config = runtime.getKitConfig();
  vi.spyOn(runtime, 'getKitConfig').mockReturnValue({
    ...config,
    sources: [{ id: 'docs', type: 'folder', path: folder, commitRaw: false }],
  } as ReturnType<typeof runtime.getKitConfig>);
});
afterEach(() => {
  vi.restoreAllMocks();
});

test('serves a cited PDF inline from a configured folder', async () => {
  const id = await insertChunk(path.resolve(folder, 'guide.pdf'), 'file');
  const response = await GET(request(), params(id));
  expect(response.status).toBe(200);
  expect(response.headers.get('Content-Type')).toBe('application/pdf');
  expect(response.headers.get('Content-Disposition')).toMatch(/^inline; filename="guide.pdf"/);
  expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  expect(
    Buffer.from(await response.arrayBuffer())
      .subarray(0, 4)
      .toString(),
  ).toBe('%PDF');
  expect((await HEAD(request('HEAD'), params(id))).status).toBe(200);
});

test('Markdown is served as plain text', async () => {
  const id = await insertChunk(path.resolve(folder, 'guide.md'), 'file');
  const response = await GET(request(), params(id));
  expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
});

test('404 outside the sources, for web documents, unknown ids and under public-demo', async () => {
  const outside = await insertChunk(path.resolve('package.json'), 'file');
  expect((await GET(request(), params(outside))).status).toBe(404);
  const web = await insertChunk('https://example.com/guide', 'web');
  expect((await GET(request(), params(web))).status).toBe(404);
  expect((await GET(request(), params('999999'))).status).toBe(404);
  expect((await GET(request(), params('1;DROP'))).status).toBe(404);
  expect((await HEAD(request('HEAD'), params('999999'))).status).toBe(404);
  const pdf = await insertChunk(path.resolve(folder, 'guide.pdf'), 'file');
  vi.spyOn(profile, 'isPublicDemo').mockReturnValue(true);
  expect((await GET(request(), params(pdf))).status).toBe(404);
});
