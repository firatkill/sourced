// T-82 / D-142 / REDESIGN-v2 §5: chat and project APIs, and turns saved by /api/ask.
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { POST as ask } from '@/app/api/ask/route';
import * as chatsRoute from '@/app/api/chats/route';
import * as chatRoute from '@/app/api/chats/[id]/route';
import * as projectsRoute from '@/app/api/projects/route';
import * as projectRoute from '@/app/api/projects/[id]/route';
import { getSql } from '@/lib/db/client';
import { ErrorBody } from '@/lib/errors';
import * as pipeline from '@/lib/generation/answer';
import * as profile from '@/lib/kit/profile';
import { getChat } from '@/lib/chats/store';
import { citations, done, meta } from '../fixtures/sse-streams';

const callbacks = vi.hoisted(() => [] as Array<() => Promise<void>>);
vi.mock('next/server', () => ({
  after: (callback: () => Promise<void>) => callbacks.push(callback),
}));
async function flushAfter() {
  for (const callback of callbacks.splice(0)) await callback();
}
const base = 'http://localhost:3000';
function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`${base}${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });
async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

beforeEach(async () => {
  vi.spyOn(profile, 'isPublicDemo').mockReturnValue(false);
  await getSql()`TRUNCATE turns, chats, projects`;
});
afterEach(() => {
  vi.restoreAllMocks();
  callbacks.length = 0;
});

test('chats: create, list, get, rename, move, pin and delete', async () => {
  const created = await chatsRoute.POST(
    call('POST', '/api/chats', { question: 'When should I use a partial index?' }),
  );
  expect(created.status).toBe(201);
  expect(created.headers.get('Cache-Control')).toBe('no-store');
  const { chat } = await json<{ chat: { id: string; title: string } }>(created);
  expect(chat.title).toBe('When should I use a partial index?');

  const project = await json<{ project: { id: string } }>(
    await projectsRoute.POST(call('POST', '/api/projects', { name: 'Indexes' })),
  );
  const patched = await chatRoute.PATCH(
    call('PATCH', `/api/chats/${chat.id}`, {
      title: 'Partial indexes',
      projectId: project.project.id,
      pinned: true,
    }),
    params(chat.id),
  );
  expect(await json(patched)).toMatchObject({
    chat: {
      title: 'Partial indexes',
      titleSource: 'user',
      projectId: project.project.id,
      pinned: true,
    },
  });
  const listed = await json<{ chats: { id: string }[] }>(
    await chatsRoute.GET(call('GET', `/api/chats?projectId=${project.project.id}`)),
  );
  expect(listed.chats.map((c) => c.id)).toEqual([chat.id]);
  const searched = await json<{ chats: unknown[] }>(
    await chatsRoute.GET(call('GET', '/api/chats?search=nothing-like-this')),
  );
  expect(searched.chats).toEqual([]);
  const got = await json<{ chat: { turns: unknown[] } }>(
    await chatRoute.GET(call('GET', `/api/chats/${chat.id}`), params(chat.id)),
  );
  expect(got.chat.turns).toEqual([]);
  expect(
    (await chatRoute.DELETE(call('DELETE', `/api/chats/${chat.id}`), params(chat.id))).status,
  ).toBe(204);
  const missing = await chatRoute.GET(call('GET', `/api/chats/${chat.id}`), params(chat.id));
  expect(missing.status).toBe(404);
  expect(ErrorBody.parse(await missing.json()).error).toMatchObject({
    code: 'NOT_FOUND',
    message: 'Not found',
  });
});

test('projects: create, get, update, list and delete keeps chats', async () => {
  const { project } = await json<{ project: { id: string } }>(
    await projectsRoute.POST(call('POST', '/api/projects', { name: 'Vendor contracts' })),
  );
  const chat = await json<{ chat: { id: string } }>(
    await chatsRoute.POST(call('POST', '/api/chats', { question: 'Q?', projectId: project.id })),
  );
  const updated = await projectRoute.PATCH(
    call('PATCH', `/api/projects/${project.id}`, { description: 'Suppliers' }),
    params(project.id),
  );
  expect(await json(updated)).toMatchObject({
    project: { name: 'Vendor contracts', description: 'Suppliers', chats: 1 },
  });
  expect(
    (await json<{ projects: unknown[] }>(await projectsRoute.GET(call('GET', '/api/projects'))))
      .projects,
  ).toHaveLength(1);
  expect(
    (await projectRoute.DELETE(call('DELETE', `/api/projects/${project.id}`), params(project.id)))
      .status,
  ).toBe(204);
  expect((await getChat(chat.chat.id)).projectId).toBeNull();
});

test('validation, origin, media type and public-demo gating', async () => {
  const unknown = await chatsRoute.POST(call('POST', '/api/chats', { question: 'Q?', extra: 1 }));
  expect(unknown.status).toBe(400);
  expect(ErrorBody.parse(await unknown.json()).error).toMatchObject({
    code: 'VALIDATION_FAILED',
    details: { field: 'body', reason: 'unknown_field' },
  });
  expect((await projectsRoute.POST(call('POST', '/api/projects', { name: '   ' }))).status).toBe(
    400,
  );
  expect(
    (await chatRoute.GET(call('GET', '/api/chats/not-a-uuid'), params('not-a-uuid'))).status,
  ).toBe(400);
  const crossSite = await chatsRoute.POST(
    call('POST', '/api/chats', { question: 'Q?' }, { origin: 'https://evil.example' }),
  );
  expect(crossSite.status).toBe(403);
  const text = await chatsRoute.POST(
    new Request(`${base}/api/chats`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: '{}',
    }),
  );
  expect(text.status).toBe(415);
  vi.spyOn(profile, 'isPublicDemo').mockReturnValue(true);
  for (const response of [
    await chatsRoute.GET(call('GET', '/api/chats')),
    await projectsRoute.GET(call('GET', '/api/projects')),
  ])
    expect(response.status).toBe(404);
});

test('/api/ask with chatId saves the finished turn once; unknown chat is 404', async () => {
  vi.spyOn(pipeline, 'answerQuestion').mockImplementation(({ emit }) => {
    emit({ event: 'meta', data: meta });
    emit({ event: 'token', data: { delta: 'A partial index covers only ' } });
    emit({ event: 'token', data: { delta: 'the rows that satisfy its predicate [P1].' } });
    emit({ event: 'citations', data: citations });
    emit({ event: 'done', data: done });
    // The route ignores the outcome; only the emitted events matter here.
    return Promise.resolve({} as Awaited<ReturnType<typeof pipeline.answerQuestion>>);
  });
  const { chat } = await json<{ chat: { id: string } }>(
    await chatsRoute.POST(call('POST', '/api/chats', { question: 'Partial?' })),
  );
  const body = { question: 'How do partial index predicates work?', chatId: chat.id };
  const response = await ask(call('POST', '/api/ask', body, { 'x-real-ip': '192.0.2.77' }));
  expect(response.status).toBe(200);
  await response.text();
  await flushAfter();
  const saved = await getChat(chat.id);
  expect(saved.turns).toHaveLength(1);
  expect(saved.turns[0]).toMatchObject({
    position: 0,
    question: 'How do partial index predicates work?',
    status: 'done',
    answer: {
      answerText: 'A partial index covers only the rows that satisfy its predicate [P1].',
      citations: { notFound: false },
    },
  });
  expect(saved.turns[0]?.answer.meta.passages[0]?.label).toBe('P1');

  const missing = await ask(
    call('POST', '/api/ask', { ...body, chatId: '00000000-0000-4000-8000-000000000000' }),
  );
  expect(missing.status).toBe(404);
});

test('/api/ask rejects chatId under public-demo and is unchanged without it', async () => {
  vi.spyOn(profile, 'isPublicDemo').mockReturnValue(true);
  const rejected = await ask(
    call('POST', '/api/ask', {
      question: 'How do partial index predicates work?',
      chatId: '00000000-0000-4000-8000-000000000000',
    }),
  );
  expect(rejected.status).toBe(400);
  expect(ErrorBody.parse(await rejected.json()).error.details).toEqual({
    field: 'body',
    reason: 'unknown_field',
  });
});
