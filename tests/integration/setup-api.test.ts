// T-89 / R2 §5–6: setup, key, document and ingest APIs. Each route is called directly,
// in a temporary checkout, against the test database; the key never leaves the server.
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { configHash, SnapshotSchema } from '@/lib/kit/load-config';
import { getCopy } from '@/lib/kit/copy';
import { resetEnvForTests } from '@/lib/env';
import { reloadKitConfig } from '@/lib/kit/runtime-config';
import { ErrorBody } from '@/lib/errors';
import { issueSetupToken, setupCookieValue } from '@/lib/setup/token';
import { resetIngestJobForTests } from '@/lib/setup/ingest-job';

const jar = vi.hoisted(() => ({ cookie: undefined as string | undefined }));
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) =>
        name === 'sourced_setup' && jar.cookie ? { name, value: jar.cookie } : undefined,
    }),
}));

const original = process.cwd();
const repoSnapshot = SnapshotSchema.parse(
  JSON.parse(await readFile(path.join(original, '.sourced/config.json'), 'utf8')),
);
let root = '';
const base = 'http://localhost:3000';
const ORIGIN = { origin: base, host: 'localhost:3000' };
function call(
  method: string,
  route: string,
  body?: unknown,
  headers: Record<string, string> = ORIGIN,
) {
  return new Request(`${base}${route}`, {
    method,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function snapshot(profile: 'local' | 'public-demo') {
  const config = { ...structuredClone(repoSnapshot.config), profile };
  await writeFile(
    path.join(root, '.sourced/config.json'),
    JSON.stringify({ ...repoSnapshot, config, configHash: configHash(config) }),
  );
  await writeFile(path.join(root, '.sourced/copy.json'), JSON.stringify(getCopy(config)));
  reloadKitConfig();
}
const routes = {
  status: () => import('@/app/api/setup/status/route'),
  data: () => import('@/app/api/setup/data/route'),
  key: () => import('@/app/api/setup/key/route'),
  files: () => import('@/app/api/setup/files/route'),
  url: () => import('@/app/api/setup/url/route'),
  estimate: () => import('@/app/api/setup/estimate/route'),
  ingest: () => import('@/app/api/ingest/route'),
  events: () => import('@/app/api/ingest/[id]/events/route'),
};
type Status = {
  setupRequired: boolean;
  providers: { id: string; saved: boolean; masked: string | null }[];
  library: { example: boolean; sources: { id: string; type: string }[]; documents: number };
};

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'sourced-setup-api-'));
  await mkdir(path.join(root, '.sourced'));
  process.chdir(root);
});
afterAll(async () => {
  process.chdir(original);
  await rm(root, { recursive: true, force: true });
});
beforeEach(async () => {
  await snapshot('local');
  jar.cookie = setupCookieValue(issueSetupToken(root));
  vi.stubEnv('MIGRATION_DATABASE_URL', process.env.DATABASE_URL ?? '');
  vi.stubEnv('LLM_MODE', 'mock');
  resetEnvForTests();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  delete process.env.OPENAI_API_KEY;
  resetEnvForTests();
});

test('guards: 404 outside the local profile, 401 without the setup cookie, 403 without a same-host Origin', async () => {
  const { GET } = await routes.status();
  const { POST } = await routes.data();
  await snapshot('public-demo');
  expect((await GET(call('GET', '/api/setup/status'))).status).toBe(404);
  await snapshot('local');
  jar.cookie = 'not-the-cookie';
  const denied = await GET(call('GET', '/api/setup/status'));
  expect(denied.status).toBe(401);
  expect(ErrorBody.parse(await denied.json()).error.code).toBe('ACCESS_DENIED');
  jar.cookie = setupCookieValue(issueSetupToken(root, false));
  expect((await GET(call('GET', '/api/setup/status'))).status).toBe(200);
  for (const headers of [
    { host: 'localhost:3000' },
    { host: 'localhost:3000', origin: 'http://evil.example' },
  ])
    expect(
      (await POST(call('POST', '/api/setup/data', { choice: 'example' }, headers))).status,
    ).toBe(403);
  const strict = await POST(call('POST', '/api/setup/data', { choice: 'example', extra: 1 }));
  expect(strict.status).toBe(400);
});

test('key: checked, saved to .env.local (0600) and the server, returned only masked, never logged', async () => {
  const key = 'sk-proj-test-ONLY-0123456789abcdefA91F';
  const lines: string[] = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    lines.push(String(chunk));
    return true;
  });
  await writeFile(path.join(root, '.env.local'), 'SOURCED_PORT=3000\nOPENAI_API_KEY=old\n');
  const { POST, DELETE } = await routes.key();
  const saved = await POST(call('POST', '/api/setup/key', { provider: 'openai', key }));
  const text = await saved.text();
  expect(saved.status).toBe(200);
  expect(JSON.parse(text)).toEqual({ provider: 'openai', masked: 'sk-proj-…A91F' });
  expect(text).not.toContain(key);
  const file = path.join(root, '.env.local');
  expect(await readFile(file, 'utf8')).toBe(`SOURCED_PORT=3000\nOPENAI_API_KEY=${key}\n`);
  expect((await stat(file)).mode & 0o777).toBe(0o600);
  expect(process.env.OPENAI_API_KEY).toBe(key);
  const status = await (await (await routes.status()).GET(call('GET', '/api/setup/status'))).text();
  expect(status).not.toContain(key);
  expect((JSON.parse(status) as Status).providers.find((p) => p.id === 'openai')).toMatchObject({
    saved: true,
    masked: 'sk-proj-…A91F',
  });

  // Live mode: the provider's answer decides; a rejection names the provider, not the key.
  vi.stubEnv('LLM_MODE', 'live');
  resetEnvForTests();
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response('{}', { status: 401 }))),
  );
  const rejected = await POST(
    call('POST', '/api/setup/key', { provider: 'anthropic', key: `${key}x` }),
  );
  expect(rejected.status).toBe(400);
  const body = await rejected.text();
  expect(ErrorBody.parse(JSON.parse(body)).error.message).toBe(
    'Anthropic did not accept this key.',
  );
  expect(body).not.toContain(key);
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new TypeError('fetch failed'))),
  );
  const offline = await POST(
    call('POST', '/api/setup/key', { provider: 'gemini', key: `${key}y` }),
  );
  expect(offline.status).toBe(502);
  vi.unstubAllGlobals();
  expect(await readFile(file, 'utf8')).not.toContain(`${key}x`);
  const invalid = await POST(
    call('POST', '/api/setup/key', { provider: 'openai', key: 'has "quote" in it' }),
  );
  expect(invalid.status).toBe(400);

  const removed = await DELETE(call('DELETE', '/api/setup/key?provider=openai'));
  expect(await removed.json()).toEqual({ provider: 'openai', masked: null });
  expect(await readFile(file, 'utf8')).toBe('SOURCED_PORT=3000\n');
  expect(process.env.OPENAI_API_KEY).toBeUndefined();
  expect(lines.join('')).not.toContain(key);
});

test('documents: own data resets the example; uploads and a URL become sources', async () => {
  const { POST: data } = await routes.data();
  expect(await (await data(call('POST', '/api/setup/data', { choice: 'example' }))).json()).toEqual(
    {
      example: true,
      removedDocuments: 0,
    },
  );
  expect((await data(call('POST', '/api/setup/data', { choice: 'own' }))).status).toBe(200);
  const again = await data(call('POST', '/api/setup/data', { choice: 'example' }));
  expect(again.status).toBe(400);
  expect(ErrorBody.parse(await again.json()).error.message).toContain(
    'git checkout sourced.config.ts',
  );

  const form = new FormData();
  form.append(
    'files',
    new File(['# Notes\n\nPartial indexes cover a subset of rows.'], 'notes/indexes.md'),
  );
  form.append('files', new File(['x'], '../escape.md'));
  form.append('files', new File(['x'], '.hidden/secret.md'));
  form.append('files', new File(['x'], 'tool.exe'));
  const { POST: files } = await routes.files();
  const upload = await files(
    new Request(`${base}/api/setup/files`, { method: 'POST', headers: ORIGIN, body: form }),
  );
  expect(await upload.json()).toEqual({
    saved: ['notes/indexes.md'],
    skipped: [
      { name: '../escape.md', reason: 'invalid_name' },
      { name: '.hidden/secret.md', reason: 'invalid_name' },
      { name: 'tool.exe', reason: 'unsupported' },
    ],
    sourceAdded: true,
  });
  expect(await readFile(path.join(root, 'my-docs/notes/indexes.md'), 'utf8')).toContain('Partial');
  await expect(stat(path.join(root, 'escape.md'))).rejects.toMatchObject({ code: 'ENOENT' });

  const { POST: url } = await routes.url();
  const added = await url(
    call('POST', '/api/setup/url', { url: 'https://docs.example.com/guide/start' }),
  );
  expect(await added.json()).toMatchObject({ source: { id: 'docs-example-com', type: 'urls' } });
  expect((await url(call('POST', '/api/setup/url', { url: 'file:///etc/passwd' }))).status).toBe(
    400,
  );

  const status = (await (
    await (await routes.status()).GET(call('GET', '/api/setup/status'))
  ).json()) as Status;
  expect(status.library.example).toBe(false);
  expect(status.library.sources.map((s) => s.id)).toEqual(['my-docs', 'docs-example-com']);
  expect(await readFile(path.join(root, 'sourced.config.ts'), 'utf8')).toContain('"my-docs"');
});

test('ingest: estimate first, then one run at a time with progress that outlives the request', async () => {
  // The previous test uploaded `my-docs/notes/indexes.md`; index only that folder.
  const config = SnapshotSchema.parse(
    JSON.parse(await readFile('.sourced/config.json', 'utf8')),
  ).config;
  const { writeConfig } = await import('@/lib/setup/config');
  const { detectSource } = await import('@/lib/cli/commands/add');
  await writeConfig({
    ...config,
    sources: [(await detectSource('my-docs', { id: 'my-docs' })).source],
  });
  resetIngestJobForTests();
  const { POST: estimate } = await routes.estimate();
  const estimated = (await (
    await estimate(call('POST', '/api/setup/estimate', {}))
  ).json()) as unknown;
  expect(estimated).toMatchObject({ documents: 1, rebuildRequired: false });
  expect((estimated as { embeddingTokens: number }).embeddingTokens).toBeGreaterThan(0);

  const { POST, GET } = await routes.ingest();
  expect((await POST(call('POST', '/api/ingest', {}))).status).toBe(400);
  const first = await POST(call('POST', '/api/ingest', { confirm: true }));
  expect(first.status).toBe(202);
  const { job } = (await first.json()) as { job: { id: string } };
  const second = await POST(call('POST', '/api/ingest', { confirm: true }));
  expect(second.status).toBe(200);
  expect(((await second.json()) as { job: { id: string } }).job.id).toBe(job.id);

  const { GET: events } = await routes.events();
  const stream = await events(call('GET', `/api/ingest/${job.id}/events`), {
    params: Promise.resolve({ id: job.id }),
  });
  expect(stream.headers.get('content-type')).toBe('text/event-stream');
  const text = await stream.text();
  const last = JSON.parse(
    text
      .trim()
      .split('\n')
      .at(-1)
      ?.replace(/^data: /, '') ?? '{}',
  ) as {
    status: string;
    runId: string | null;
    documents: { total: number; done: number };
  };
  expect(last).toMatchObject({ status: 'succeeded', documents: { total: 1, done: 1 } });
  expect(last.runId).toMatch(/^\d+$/);
  const progress = (await (await GET(call('GET', '/api/ingest'))).json()) as {
    job: { status: string };
  };
  expect(progress.job.status).toBe('succeeded');
  const status = (await (
    await (await routes.status()).GET(call('GET', '/api/setup/status'))
  ).json()) as Status;
  expect(status.library.documents).toBe(1);
  expect(
    (
      await events(call('GET', '/api/ingest/other/events'), {
        params: Promise.resolve({ id: 'other' }),
      })
    ).status,
  ).toBe(404);
});

test('T-91 models: answer and check models apply without a restart; a new embedding model is estimated, then rebuilt', async () => {
  const { getKitConfig } = await import('@/lib/kit/runtime-config');
  const { writeConfig } = await import('@/lib/setup/config');
  const { detectSource } = await import('@/lib/cli/commands/add');
  const config = SnapshotSchema.parse(
    JSON.parse(await readFile('.sourced/config.json', 'utf8')),
  ).config;
  await writeConfig({
    ...config,
    sources: [(await detectSource('my-docs', { id: 'my-docs' })).source],
  });
  resetIngestJobForTests();
  const models = await import('@/app/api/settings/models/route');
  const listed = (await (await models.GET(call('GET', '/api/settings/models'))).json()) as {
    current: { chat: string; embed: string };
    chat: { id: string; available: boolean }[];
    embed: { id: string }[];
  };
  expect(listed.current.chat).toBe('openai:gpt-6-luna');
  expect(listed.chat.map((m) => m.id)).toContain('anthropic:claude-sonnet-5-5');
  expect(listed.embed.map((m) => m.id)).toContain('openai:text-embedding-3-large');

  const patched = await models.PATCH(
    call('PATCH', '/api/settings/models', { chat: 'openai:gpt-5.4' }),
  );
  expect(patched.status).toBe(200);
  // The running server reads the new model on the next request.
  expect(getKitConfig(false).models.chat).toEqual({ provider: 'openai', model: 'gpt-5.4' });
  expect(await readFile('sourced.config.ts', 'utf8')).toContain('"gpt-5.4"');
  for (const body of [{}, { chat: 'nope' }, { embed: 'openai:text-embedding-3-large' }])
    expect((await models.PATCH(call('PATCH', '/api/settings/models', body))).status).toBe(400);

  const estimate = await import('@/app/api/settings/embedding/estimate/route');
  const before = await readFile('.sourced/config.json', 'utf8');
  const estimated = (await (
    await estimate.POST(
      call('POST', '/api/settings/embedding/estimate', { embed: 'openai:text-embedding-3-large' }),
    )
  ).json()) as { documents: number };
  expect(estimated.documents).toBe(1);
  expect(await readFile('.sourced/config.json', 'utf8')).toBe(before);
  expect(getKitConfig(false).models.embed.model).toBe('text-embedding-3-small');
  const same = await estimate.POST(
    call('POST', '/api/settings/embedding/estimate', { embed: 'openai:text-embedding-3-small' }),
  );
  expect(same.status).toBe(400);

  const embedding = await import('@/app/api/settings/embedding/route');
  expect(
    (
      await embedding.POST(
        call('POST', '/api/settings/embedding', { embed: 'openai:text-embedding-3-large' }),
      )
    ).status,
  ).toBe(400);
  const started = await embedding.POST(
    call('POST', '/api/settings/embedding', {
      embed: 'openai:text-embedding-3-large',
      confirm: true,
    }),
  );
  expect(started.status).toBe(202);
  expect(getKitConfig(false).models.embed).toEqual({
    provider: 'openai',
    model: 'text-embedding-3-large',
    dimensions: 1536,
  });
  const { currentJob } = await import('@/lib/setup/ingest-job');
  await expect.poll(() => currentJob()?.status, { timeout: 20_000 }).toBe('succeeded');
  const { getSql } = await import('@/lib/db/client');
  // Mock mode records its own embedding model; the run itself is the rebuild.
  expect(currentJob()?.rebuild).toBe(true);
  const [row] = await getSql()<{ status: string; total: number }[]>`
    SELECT status, documents_total AS total FROM ingest_runs ORDER BY id DESC LIMIT 1`;
  expect(row).toEqual({ status: 'succeeded', total: 1 });
});

test('T-92 data: export a chat as Markdown, delete all chats, remove a source and its documents', async () => {
  const { createChat, appendTurn } = await import('@/lib/chats/store');
  const { getSql } = await import('@/lib/db/client');
  const chat = await createChat({ question: 'How many leave days?', projectId: null });
  await appendTurn(chat.id, {
    question: 'How many leave days?',
    standaloneQuestion: null,
    status: 'done',
    answer: {
      meta: {
        requestId: crypto.randomUUID(),
        cached: false,
        cachedAt: null,
        passages: [],
        retrieval: {
          vectorCandidates: 0,
          ftsCandidates: 0,
          rerankFallback: false,
          rerankFallbackReason: null,
          timingsMs: { embed: 0, search: 0, rerank: 0 },
        },
      },
      answerText: 'Twenty-five.',
      citations: null,
      done: null,
    },
  });
  const exported = await (
    await import('@/app/api/chats/[id]/export/route')
  ).GET(call('GET', `/api/chats/${chat.id}/export`), { params: Promise.resolve({ id: chat.id }) });
  expect(exported.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
  expect(exported.headers.get('content-disposition')).toBe(
    'attachment; filename="how-many-leave-days.md"',
  );
  expect(await exported.text()).toContain('## How many leave days?\n\nTwenty-five.');

  const chats = await import('@/app/api/settings/chats/route');
  expect(
    (
      await chats.DELETE(
        call('DELETE', '/api/settings/chats', undefined, { host: 'localhost:3000' }),
      )
    ).status,
  ).toBe(403);
  expect(await (await chats.DELETE(call('DELETE', '/api/settings/chats'))).json()).toEqual({
    removedChats: 1,
  });

  // beforeEach restored the example configuration; the index still holds `my-docs`.
  const { writeConfig } = await import('@/lib/setup/config');
  const { detectSource } = await import('@/lib/cli/commands/add');
  const current = SnapshotSchema.parse(
    JSON.parse(await readFile('.sourced/config.json', 'utf8')),
  ).config;
  await writeConfig({
    ...current,
    sources: [(await detectSource('my-docs', { id: 'my-docs' })).source],
  });
  const sources = await import('@/app/api/settings/sources/route');
  expect((await sources.DELETE(call('DELETE', '/api/settings/sources?id=nope'))).status).toBe(404);
  const [counted] = await getSql()<{ count: number }[]>`
    SELECT count(*)::int AS count FROM documents WHERE source_id = 'my-docs'`;
  const before = counted?.count ?? 0;
  expect(before).toBeGreaterThan(0);
  expect(
    await (await sources.DELETE(call('DELETE', '/api/settings/sources?id=my-docs'))).json(),
  ).toEqual({
    removedDocuments: before,
  });
  const config = SnapshotSchema.parse(
    JSON.parse(await readFile('.sourced/config.json', 'utf8')),
  ).config;
  expect(config.sources.map((s) => s.id)).not.toContain('my-docs');
  // Files on disk stay.
  expect(await readFile(path.join(root, 'my-docs/notes/indexes.md'), 'utf8')).toContain('Partial');
});

test('uploads never follow a symlinked folder out of my-docs', async () => {
  const { symlink, readdir } = await import('node:fs/promises');
  const outside = await mkdtemp(path.join(tmpdir(), 'sourced-outside-'));
  await mkdir(path.join(root, 'my-docs'), { recursive: true });
  await symlink(outside, path.join(root, 'my-docs/linked'), 'dir');
  const form = new FormData();
  form.append('files', new File(['# Escape'], 'linked/escape.md'));
  const { POST } = await routes.files();
  const result = await POST(
    new Request(`${base}/api/setup/files`, { method: 'POST', headers: ORIGIN, body: form }),
  );
  expect(await result.json()).toMatchObject({
    saved: [],
    skipped: [{ name: 'linked/escape.md', reason: 'invalid_name' }],
  });
  expect(await readdir(outside)).toEqual([]);
  await rm(outside, { recursive: true, force: true });
});
