// @vitest-environment jsdom
// D-154: the hosted demo keeps chats and projects in this tab's sessionStorage.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chatApi, chatStore } from '@/lib/chats/client';
import {
  SESSION_KEY,
  SessionChatError,
  appendSessionTurn,
  getSessionChat,
  getSessionProject,
  listSessionChats,
  readRaw,
  sessionChatApi,
} from '@/lib/chats/session-store';
import { savedTurn } from '@/components/ask/restore';
import type { TurnAnswer } from '@/lib/chats/schema';

const requestId = '6f1d1c1e-8f7a-4c4b-9a55-0c2f7f1d9a10';
const meta: TurnAnswer['meta'] = {
  requestId,
  cached: false,
  cachedAt: null,
  passages: [],
  retrieval: {
    vectorCandidates: 1,
    ftsCandidates: 0,
    rerankFallback: false,
    rerankFallbackReason: null,
    timingsMs: { embed: 1, search: 1, rerank: 1 },
  },
};
const done: NonNullable<TurnAnswer['done']> = {
  requestId,
  cached: false,
  usage: { embeddingTokens: 1, inputTokens: 1, outputTokens: 1 },
  costUsdEstimate: null,
  latencyMs: { total: 1, firstToken: 1, generation: 1 },
};
const citations = {
  answer: 'A partial index [P1].',
  notFound: false,
  valid: [],
  invalid: [],
  quoteFallbackUsed: false,
};
const answer = (text: string): TurnAnswer => ({
  meta,
  answerText: text,
  citations: { ...citations, answer: text },
  done,
});

beforeEach(() => {
  sessionStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('sessionChatApi', () => {
  it('is the store chatStore picks for session storage', () => {
    expect(chatStore('session')).toBe(sessionChatApi);
    expect(chatStore('server')).toBe(chatApi);
    expect(chatStore()).toBe(chatApi);
  });

  it('creates, lists (pinned first, newest next), searches and deletes chats', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-21T10:00:00Z'));
    const first = await sessionChatApi.createChat({ question: 'How do partial indexes work?' });
    vi.setSystemTime(new Date('2026-11-21T10:01:00Z'));
    const second = await sessionChatApi.createChat({ question: 'What is VACUUM?' });
    expect(first.titleSource).toBe('auto');
    expect((await sessionChatApi.listChats()).map((chat) => chat.id)).toEqual([
      second.id,
      first.id,
    ]);
    await sessionChatApi.updateChat(first.id, { pinned: true });
    expect((await sessionChatApi.listChats()).map((chat) => chat.id)).toEqual([
      first.id,
      second.id,
    ]);

    appendSessionTurn(second.id, {
      question: 'And autovacuum?',
      status: 'done',
      answer: answer('x'),
    });
    expect((await sessionChatApi.listChats('AUTOVAC')).map((chat) => chat.id)).toEqual([second.id]);
    expect((await sessionChatApi.listChats('partial')).map((chat) => chat.id)).toEqual([first.id]);
    expect(await sessionChatApi.listChats('nothing')).toEqual([]);

    const renamed = await sessionChatApi.updateChat(second.id, { title: 'Vacuum notes' });
    expect(renamed).toMatchObject({ title: 'Vacuum notes', titleSource: 'user' });
    await sessionChatApi.deleteChat(second.id);
    expect((await sessionChatApi.listChats()).map((chat) => chat.id)).toEqual([first.id]);
    await expect(sessionChatApi.deleteChat(second.id)).rejects.toThrow(SessionChatError);
  });

  it('cuts a long first question into the automatic title', async () => {
    const chat = await sessionChatApi.createChat({ question: `${'word '.repeat(30)}end` });
    expect(chat.title.length).toBeLessThanOrEqual(60);
    expect(chat.title.endsWith('…')).toBe(true);
    await expect(sessionChatApi.createChat({ question: '   ' })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('keeps turns in order and returns them in the server’s shape', async () => {
    const chat = await sessionChatApi.createChat({ question: 'Q1' });
    appendSessionTurn(chat.id, { question: 'Q1', status: 'done', answer: answer('one') });
    appendSessionTurn(chat.id, { question: 'Q2', status: 'stopped', answer: answer('two') });
    const loaded = getSessionChat(chat.id);
    expect(loaded?.turns.map((turn) => [turn.position, turn.question, turn.status])).toEqual([
      [1, 'Q1', 'done'],
      [2, 'Q2', 'stopped'],
    ]);
    expect(loaded?.turns[0]?.answer.answerText).toBe('one');
    expect(getSessionChat('missing')).toBeNull();
    expect(() => {
      appendSessionTurn('missing', { question: 'Q', status: 'done', answer: answer('x') });
    }).toThrow(SessionChatError);
  });

  it('projects hold chats, rename, and on delete give their chats back to Chats', async () => {
    const beta = await sessionChatApi.createProject('beta');
    const alpha = await sessionChatApi.createProject('Alpha');
    expect((await sessionChatApi.listProjects()).map((project) => project.name)).toEqual([
      'Alpha',
      'beta',
    ]);
    const inside = await sessionChatApi.createChat({ question: 'Q', projectId: alpha.id });
    const moved = await sessionChatApi.createChat({ question: 'R' });
    await sessionChatApi.updateChat(moved.id, { projectId: alpha.id });
    expect(getSessionProject(alpha.id)).toMatchObject({ chats: 2, sourceIds: null });
    expect(
      listSessionChats({ projectId: alpha.id })
        .map((chat) => chat.id)
        .sort(),
    ).toEqual([inside.id, moved.id].sort());
    await expect(
      sessionChatApi.createChat({ question: 'S', projectId: crypto.randomUUID() }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      sessionChatApi.updateChat(moved.id, { projectId: crypto.randomUUID() }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const updated = await sessionChatApi.updateProject(beta.id, {
      name: 'Gamma',
      description: 'Notes',
    });
    expect(updated).toMatchObject({ name: 'Gamma', description: 'Notes', chats: 0 });
    expect(
      (await sessionChatApi.updateProject(beta.id, { description: null })).description,
    ).toBeNull();

    await sessionChatApi.deleteProject(alpha.id);
    expect(getSessionProject(alpha.id)).toBeNull();
    expect(listSessionChats().every((chat) => chat.projectId === null)).toBe(true);
    await expect(sessionChatApi.deleteProject(alpha.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('starts empty when the tab’s copy is missing or damaged', async () => {
    expect(readRaw()).toBeNull();
    expect(await sessionChatApi.listChats()).toEqual([]);
    sessionStorage.setItem(SESSION_KEY, '{not json');
    expect(await sessionChatApi.listChats()).toEqual([]);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ chats: [{ id: 1 }], projects: [] }));
    expect(await sessionChatApi.listProjects()).toEqual([]);
  });

  it('drops the oldest unpinned chat when the tab’s storage is full', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-21T10:00:00Z'));
    const oldest = await sessionChatApi.createChat({ question: 'Oldest' });
    vi.setSystemTime(new Date('2026-11-21T10:01:00Z'));
    const newer = await sessionChatApi.createChat({ question: 'Newer' });
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    setItem.mockImplementationOnce(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    vi.setSystemTime(new Date('2026-11-21T10:02:00Z'));
    const latest = await sessionChatApi.createChat({ question: 'Latest' });
    expect((await sessionChatApi.listChats()).map((chat) => chat.id)).toEqual([
      latest.id,
      newer.id,
    ]);
    expect(getSessionChat(oldest.id)).toBeNull();

    setItem.mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    await expect(sessionChatApi.createChat({ question: 'Again' })).rejects.toMatchObject({
      code: 'STORAGE_FULL',
    });
  });

  it('keeps chats for the page when sessionStorage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    const chat = await sessionChatApi.createChat({ question: 'Blocked storage' });
    expect((await sessionChatApi.listChats()).map((entry) => entry.id)).toContain(chat.id);
  });
});

describe('savedTurn', () => {
  const question = 'Q';
  it('turns finished phases into the saved turn and skips the rest', () => {
    expect(savedTurn({ kind: 'done', question, meta, citations, done }, citations)).toMatchObject({
      status: 'done',
      answer: { answerText: citations.answer },
    });
    expect(
      savedTurn(
        { kind: 'done', question, meta, citations: { ...citations, notFound: true }, done },
        citations,
      )?.status,
    ).toBe('not_found');
    expect(savedTurn({ kind: 'notFound', question, meta, done: null }, null)).toMatchObject({
      status: 'not_found',
      answer: { citations: null },
    });
    expect(savedTurn({ kind: 'stopped', question, partialText: 'part', meta }, null)).toMatchObject(
      { status: 'stopped', answer: { answerText: 'part' } },
    );
    expect(savedTurn({ kind: 'notFound', question, meta: null, done: null }, null)).toBeNull();
    expect(savedTurn({ kind: 'submitting', question }, null)).toBeNull();
    expect(savedTurn({ kind: 'serverError', question, requestId }, null)).toBeNull();
  });
});
