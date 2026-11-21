'use client';

import { sessionChatApi } from './session-store';

/** Browser helpers for /api/chats and /api/projects (T-83). Errors throw with the API code. */
export type ChatItem = {
  id: string;
  projectId: string | null;
  title: string;
  titleSource: 'auto' | 'user';
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};
export type ProjectItem = {
  id: string;
  name: string;
  description: string | null;
  sourceIds: string[] | null;
  chats: number;
  createdAt: string;
  updatedAt: string;
};

export class ChatApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const parsed = (await response.json().catch(() => null)) as {
      error?: { code?: string };
    } | null;
    throw new ChatApiError(response.status, parsed?.error?.code ?? 'INTERNAL_ERROR');
  }
  return (response.status === 204 ? undefined : await response.json()) as T;
}

export const chatApi = {
  listChats: (search = '') =>
    call<{ chats: ChatItem[] }>(
      'GET',
      `/api/chats${search ? `?search=${encodeURIComponent(search)}` : ''}`,
    ).then((r) => r.chats),
  createChat: (input: { question: string; projectId?: string | null }) =>
    call<{ chat: ChatItem }>('POST', '/api/chats', input).then((r) => r.chat),
  updateChat: (
    id: string,
    input: { title?: string; projectId?: string | null; pinned?: boolean },
  ) => call<{ chat: ChatItem }>('PATCH', `/api/chats/${id}`, input).then((r) => r.chat),
  deleteChat: (id: string) => call<undefined>('DELETE', `/api/chats/${id}`),
  listProjects: () =>
    call<{ projects: ProjectItem[] }>('GET', '/api/projects').then((r) => r.projects),
  createProject: (name: string) =>
    call<{ project: ProjectItem }>('POST', '/api/projects', { name }).then((r) => r.project),
  updateProject: (
    id: string,
    input: { name?: string; description?: string | null; sourceIds?: string[] | null },
  ) => call<{ project: ProjectItem }>('PATCH', `/api/projects/${id}`, input).then((r) => r.project),
  deleteProject: (id: string) => call<undefined>('DELETE', `/api/projects/${id}`),
};

/** D-154: where chats are kept. The hosted demo keeps them in this tab, others on the server. */
export type ChatStorage = 'server' | 'session';
export type ChatStore = typeof chatApi;
export function chatStore(storage: ChatStorage = 'server'): ChatStore {
  return storage === 'session' ? sessionChatApi : chatApi;
}

/** Lets the conversation tell the sidebar that chats changed (created, a turn finished). */
export const CHATS_CHANGED = 'sourced:chats-changed';
export function announceChatsChanged() {
  window.dispatchEvent(new Event(CHATS_CHANGED));
}
