'use client';

import { z } from 'zod';
import {
  ChatTitle,
  ProjectDescription,
  ProjectName,
  TurnAnswer,
  TurnStatus,
  chatTitle,
} from './schema';
import type { ChatItem, ProjectItem } from './client';
import type { SavedTurn } from './store';

/**
 * D-154: in the hosted demo, chats and projects live in this browser tab's sessionStorage.
 * The server keeps none of them; closing the tab removes them. The API matches `chatApi`.
 */
export const SESSION_KEY = 'sourced-chats';

const Chat = z.object({
  id: z.string(),
  projectId: z.string().nullable(),
  title: z.string(),
  titleSource: z.enum(['auto', 'user']),
  pinned: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  turns: z.array(
    z.object({
      question: z.string(),
      status: TurnStatus,
      answer: TurnAnswer,
      createdAt: z.string(),
    }),
  ),
});
const Project = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
const Data = z.object({ chats: z.array(z.unknown()), projects: z.array(z.unknown()) });
type Data = { chats: StoredChat[]; projects: z.infer<typeof Project>[] };
type StoredChat = z.infer<typeof Chat>;

/** Thrown with the same codes the HTTP API uses, so callers handle both alike. */
export class SessionChatError extends Error {
  constructor(readonly code: 'NOT_FOUND' | 'VALIDATION_FAILED' | 'STORAGE_FULL') {
    super(code);
  }
}

let memory: string | null = null; // Used when sessionStorage is blocked.

export function readRaw(): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return memory;
  }
}

function read(): Data {
  const raw = readRaw();
  if (!raw) return { chats: [], projects: [] };
  try {
    const parsed = Data.safeParse(JSON.parse(raw));
    if (!parsed.success) return { chats: [], projects: [] };
    // A damaged entry is dropped on its own; the rest of the tab's chats stay.
    const valid = <T>(schema: z.ZodType<T>, list: unknown[]) =>
      list.flatMap((entry) => {
        const one = schema.safeParse(entry);
        return one.success ? [one.data] : [];
      });
    return {
      chats: valid(Chat, parsed.data.chats),
      projects: valid(Project, parsed.data.projects),
    };
  } catch {
    return { chats: [], projects: [] };
  }
}

function isQuota(error: unknown) {
  return error instanceof DOMException && /quota/i.test(error.name);
}

/** Writes the data; when the tab's storage is full, the oldest unpinned chats go first. */
function write(data: Data) {
  const next = { ...data, chats: [...data.chats] };
  for (;;) {
    const raw = JSON.stringify(next);
    try {
      sessionStorage.setItem(SESSION_KEY, raw);
      memory = raw;
      return;
    } catch (error) {
      if (!isQuota(error)) {
        memory = raw; // Storage is blocked: the chats last for this page only.
        return;
      }
      const oldest = next.chats
        .map((chat, index) => ({ chat, index }))
        .filter(({ chat }) => !chat.pinned && next.chats.length > 1)
        .sort((a, b) => a.chat.updatedAt.localeCompare(b.chat.updatedAt))[0];
      if (!oldest) throw new SessionChatError('STORAGE_FULL');
      next.chats.splice(oldest.index, 1);
    }
  }
}

const now = () => new Date().toISOString();
const summary = (chat: StoredChat): ChatItem => ({
  id: chat.id,
  projectId: chat.projectId,
  title: chat.title,
  titleSource: chat.titleSource,
  pinned: chat.pinned,
  createdAt: chat.createdAt,
  updatedAt: chat.updatedAt,
});
const order = (a: StoredChat, b: StoredChat) =>
  Number(b.pinned) - Number(a.pinned) ||
  b.updatedAt.localeCompare(a.updatedAt) ||
  a.id.localeCompare(b.id);

function find<T extends { id: string }>(list: T[], id: string): T {
  const found = list.find((entry) => entry.id === id);
  if (!found) throw new SessionChatError('NOT_FOUND');
  return found;
}
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new SessionChatError('VALIDATION_FAILED');
  return parsed.data;
}

function listChatsSync(search = ''): ChatItem[] {
  const term = search.trim().toLowerCase();
  return read()
    .chats.filter(
      (chat) =>
        !term ||
        chat.title.toLowerCase().includes(term) ||
        chat.turns.some((turn) => turn.question.toLowerCase().includes(term)),
    )
    .sort(order)
    .map(summary);
}

function listProjectsSync(): ProjectItem[] {
  const data = read();
  return data.projects
    .map((project) => ({
      ...project,
      sourceIds: null,
      chats: data.chats.filter((chat) => chat.projectId === project.id).length,
    }))
    .sort(
      (a, b) =>
        a.name.toLowerCase().localeCompare(b.name.toLowerCase()) ||
        a.createdAt.localeCompare(b.createdAt),
    );
}

/** A chat with its turns in the shape the server returns, or null when this tab lacks it. */
export function getSessionChat(id: string): (ChatItem & { turns: SavedTurn[] }) | null {
  const chat = read().chats.find((entry) => entry.id === id);
  if (!chat) return null;
  return {
    ...summary(chat),
    turns: chat.turns.map((turn, index) => ({
      id: `${chat.id}-${String(index + 1)}`,
      position: index + 1,
      question: turn.question,
      standaloneQuestion: turn.answer.meta.standaloneQuestion ?? null,
      answer: turn.answer,
      status: turn.status,
      createdAt: turn.createdAt,
    })),
  };
}

export function getSessionProject(id: string): ProjectItem | null {
  return listProjectsSync().find((project) => project.id === id) ?? null;
}

export function listSessionChats(options: { projectId?: string } = {}): ChatItem[] {
  const chats = listChatsSync();
  return options.projectId ? chats.filter((chat) => chat.projectId === options.projectId) : chats;
}

/** Saves a finished turn, as the server does after the stream for a saved chat. */
export function appendSessionTurn(
  id: string,
  turn: { question: string; status: TurnStatus; answer: TurnAnswer },
) {
  const data = read();
  const chat = find(data.chats, id);
  chat.turns.push({ ...turn, createdAt: now() });
  chat.updatedAt = now();
  write(data);
}

/* eslint-disable @typescript-eslint/require-await -- async like `chatApi`: errors reject, never throw */
export const sessionChatApi = {
  listChats: async (search = '') => listChatsSync(search),
  createChat: async (input: { question: string; projectId?: string | null }) => {
    const data = read();
    const projectId = input.projectId ?? null;
    if (projectId) find(data.projects, projectId);
    const time = now();
    const chat: StoredChat = {
      id: crypto.randomUUID(),
      projectId,
      title: parse(ChatTitle, chatTitle(input.question)),
      titleSource: 'auto',
      pinned: false,
      createdAt: time,
      updatedAt: time,
      turns: [],
    };
    data.chats.push(chat);
    write(data);
    return summary(chat);
  },
  updateChat: async (
    id: string,
    input: { title?: string; projectId?: string | null; pinned?: boolean },
  ) => {
    const data = read();
    const chat = find(data.chats, id);
    if (input.title !== undefined) {
      chat.title = parse(ChatTitle, input.title);
      chat.titleSource = 'user';
    }
    if (input.projectId !== undefined) {
      if (input.projectId) find(data.projects, input.projectId);
      chat.projectId = input.projectId;
    }
    if (input.pinned !== undefined) chat.pinned = input.pinned;
    chat.updatedAt = input.title !== undefined ? now() : chat.updatedAt;
    write(data);
    return summary(chat);
  },
  deleteChat: async (id: string) => {
    const data = read();
    find(data.chats, id);
    write({ ...data, chats: data.chats.filter((chat) => chat.id !== id) });
    return undefined;
  },
  listProjects: async () => listProjectsSync(),
  createProject: async (name: string) => {
    const data = read();
    const time = now();
    const project = {
      id: crypto.randomUUID(),
      name: parse(ProjectName, name),
      description: null,
      createdAt: time,
      updatedAt: time,
    };
    data.projects.push(project);
    write(data);
    return { ...project, sourceIds: null, chats: 0 } satisfies ProjectItem;
  },
  updateProject: async (
    id: string,
    input: { name?: string; description?: string | null; sourceIds?: string[] | null },
  ) => {
    const data = read();
    const project = find(data.projects, id);
    if (input.name !== undefined) project.name = parse(ProjectName, input.name);
    if (input.description !== undefined)
      project.description =
        input.description === null ? null : parse(ProjectDescription, input.description) || null;
    project.updatedAt = now();
    write(data);
    return find(listProjectsSync(), id);
  },
  deleteProject: async (id: string) => {
    const data = read();
    find(data.projects, id);
    // Like ON DELETE SET NULL: the project's chats move back to Chats.
    write({
      projects: data.projects.filter((project) => project.id !== id),
      chats: data.chats.map((chat) =>
        chat.projectId === id ? { ...chat, projectId: null } : chat,
      ),
    });
    return undefined;
  },
};
/* eslint-enable @typescript-eslint/require-await */
