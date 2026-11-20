// T-81 / D-142, D-144 / REDESIGN-v2 §4: saved chats, projects and turns.
import { beforeEach, expect, test } from 'vitest';
import { getSql } from '@/lib/db/client';
import {
  NotFoundError,
  appendTurn,
  createChat,
  createProject,
  deleteAllChats,
  deleteChat,
  deleteProject,
  getChat,
  getProject,
  listChats,
  listProjects,
  updateChat,
  updateProject,
} from '@/lib/chats/store';
import type { TurnAnswer } from '@/lib/chats/schema';

const answer = (text: string): TurnAnswer => ({
  meta: {
    requestId: '11111111-1111-4111-8111-111111111111',
    cached: false,
    cachedAt: null,
    passages: [
      {
        label: 'P1',
        chunkId: '1',
        documentTitle: 'Contract',
        headingPath: ['Termination'],
        officialUrl: 'https://example.test/contract',
        content: 'Either party may terminate with ninety days notice.',
        snippet: 'Either party may terminate with ninety days notice.',
        scores: { rrf: 1 / 61, vectorRank: 1, ftsRank: null, rerankPosition: 1 },
      },
    ],
    retrieval: {
      vectorCandidates: 1,
      ftsCandidates: 0,
      rerankFallback: false,
      rerankFallbackReason: null,
      timingsMs: { embed: 1, search: 1, rerank: 0 },
    },
  },
  answerText: text,
  citations: null,
  done: null,
});

beforeEach(async () => {
  await getSql()`TRUNCATE turns, chats, projects`;
});

test('a chat gets its first question as title and keeps turns in order', async () => {
  const chat = await createChat({
    question: 'What is the notice period if we want to end the Acme contract early, and to whom?',
  });
  expect(chat.title).toBe('What is the notice period if we want to end the Acme…');
  expect(chat.titleSource).toBe('auto');
  const first = await appendTurn(chat.id, {
    question: 'First?',
    answer: answer('One [P1].'),
    status: 'done',
  });
  const second = await appendTurn(chat.id, {
    question: 'Second?',
    standaloneQuestion: 'Second, standalone?',
    answer: answer('Two [P1].'),
    status: 'not_found',
  });
  expect([first.position, second.position]).toEqual([0, 1]);
  const loaded = await getChat(chat.id);
  expect(loaded.turns.map((turn) => [turn.question, turn.status, turn.standaloneQuestion])).toEqual(
    [
      ['First?', 'done', null],
      ['Second?', 'not_found', 'Second, standalone?'],
    ],
  );
  expect(loaded.turns[0]?.answer.meta.passages[0]?.documentTitle).toBe('Contract');
  expect(Date.parse(loaded.updatedAt)).toBeGreaterThanOrEqual(Date.parse(chat.updatedAt));
});

test('rename, move, pin and list with search, pinned first', async () => {
  const project = await createProject({ name: 'Vendor contracts', description: 'Suppliers' });
  const a = await createChat({ question: 'Renewal dates for all vendors' });
  const b = await createChat({ question: 'Who approves travel over 2000 EUR?' });
  await appendTurn(b.id, { question: 'Travel approvals', answer: answer('x'), status: 'done' });
  const renamed = await updateChat(a.id, { title: 'Renewals', projectId: project.id });
  expect(renamed).toMatchObject({ title: 'Renewals', titleSource: 'user', projectId: project.id });
  await updateChat(a.id, { pinned: true });
  expect((await listChats()).map((chat) => chat.id)).toEqual([a.id, b.id]);
  expect((await listChats({ projectId: project.id })).map((chat) => chat.id)).toEqual([a.id]);
  expect((await listChats({ search: 'approvals' })).map((chat) => chat.id)).toEqual([b.id]);
  expect((await listChats({ search: '100%_' })).length).toBe(0);
  expect((await getProject(project.id)).chats).toBe(1);
  await updateChat(a.id, { projectId: null });
  expect((await getChat(a.id)).projectId).toBeNull();
});

test('projects: update, delete keeps chats, list is sorted by name', async () => {
  const z = await createProject({ name: 'zeta' });
  const a = await createProject({ name: 'Alpha' });
  expect((await listProjects()).map((p) => p.name)).toEqual(['Alpha', 'zeta']);
  const updated = await updateProject(z.id, { name: 'Zeta', description: null });
  expect(updated).toMatchObject({ name: 'Zeta', description: null });
  const chat = await createChat({ question: 'Kept?', projectId: a.id });
  await deleteProject(a.id);
  expect((await getChat(chat.id)).projectId).toBeNull();
  await expect(getProject(a.id)).rejects.toBeInstanceOf(NotFoundError);
});

test('delete cascades turns; deleteAllChats empties chats and projects', async () => {
  const chat = await createChat({ question: 'Delete me' });
  await appendTurn(chat.id, { question: 'q', answer: answer('a'), status: 'done' });
  await deleteChat(chat.id);
  expect((await getSql()`SELECT count(*)::integer AS n FROM turns`)[0]).toEqual({ n: 0 });
  await expect(deleteChat(chat.id)).rejects.toBeInstanceOf(NotFoundError);
  await createProject({ name: 'P' });
  await createChat({ question: 'one' });
  await createChat({ question: 'two' });
  expect(await deleteAllChats()).toBe(2);
  expect(await listChats()).toEqual([]);
  expect(await listProjects()).toEqual([]);
});

test('invalid input is rejected before the database', async () => {
  await expect(createProject({ name: '  ' })).rejects.toThrow();
  await expect(getChat('not-a-uuid')).rejects.toThrow();
  await expect(
    appendTurn('00000000-0000-4000-8000-000000000000', {
      question: 'q',
      answer: answer('a'),
      status: 'done',
    }),
  ).rejects.toBeInstanceOf(NotFoundError);
});
