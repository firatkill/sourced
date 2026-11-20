import 'server-only';
import { z } from 'zod';
import type postgres from 'postgres';
import { getSql } from '@/lib/db/client';
import {
  ChatTitle,
  ProjectDescription,
  ProjectName,
  TurnAnswer,
  TurnStatus,
  chatTitle,
} from './schema';

/** D-142 / REDESIGN-v2 §4: saved chats and projects (local and private profiles only). */
type Sql = postgres.Sql;

const Uuid = z.uuid();
const Time = z.date().transform((value) => value.toISOString());

const ProjectRow = z.object({
  id: Uuid,
  name: z.string(),
  description: z.string().nullable(),
  chats: z.number().int().nonnegative(),
  created_at: Time,
  updated_at: Time,
});
export type Project = {
  id: string;
  name: string;
  description: string | null;
  chats: number;
  createdAt: string;
  updatedAt: string;
};
const toProject = (row: unknown): Project => {
  const r = ProjectRow.parse(row);
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    chats: r.chats,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
};

const ChatRow = z.object({
  id: Uuid,
  project_id: Uuid.nullable(),
  title: z.string(),
  title_source: z.enum(['auto', 'user']),
  pinned: z.boolean(),
  created_at: Time,
  updated_at: Time,
});
export type ChatSummary = {
  id: string;
  projectId: string | null;
  title: string;
  titleSource: 'auto' | 'user';
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};
const toChat = (row: unknown): ChatSummary => {
  const r = ChatRow.parse(row);
  return {
    id: r.id,
    projectId: r.project_id,
    title: r.title,
    titleSource: r.title_source,
    pinned: r.pinned,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
};

const TurnRow = z.object({
  id: Uuid,
  position: z.number().int().nonnegative(),
  question: z.string(),
  standalone_question: z.string().nullable(),
  answer: TurnAnswer,
  status: TurnStatus,
  created_at: Time,
});
export type SavedTurn = {
  id: string;
  position: number;
  question: string;
  standaloneQuestion: string | null;
  answer: TurnAnswer;
  status: TurnStatus;
  createdAt: string;
};
const toTurn = (row: unknown): SavedTurn => {
  const r = TurnRow.parse(row);
  return {
    id: r.id,
    position: r.position,
    question: r.question,
    standaloneQuestion: r.standalone_question,
    answer: r.answer,
    status: r.status,
    createdAt: r.created_at,
  };
};

export class NotFoundError extends Error {}
const one = <T>(rows: readonly T[], what: string): T => {
  const [row] = rows;
  if (row === undefined) throw new NotFoundError(`${what} not found`);
  return row;
};

// Projects --------------------------------------------------------------------------------

export async function listProjects(sql: Sql = getSql()): Promise<Project[]> {
  const rows = await sql`
    SELECT p.*, (SELECT count(*)::integer FROM chats c WHERE c.project_id = p.id) AS chats
    FROM projects p ORDER BY lower(p.name), p.created_at`;
  return rows.map(toProject);
}

export async function getProject(id: string, sql: Sql = getSql()): Promise<Project> {
  const rows = await sql`
    SELECT p.*, (SELECT count(*)::integer FROM chats c WHERE c.project_id = p.id) AS chats
    FROM projects p WHERE p.id = ${Uuid.parse(id)}`;
  return toProject(one(rows, 'Project'));
}

export async function createProject(
  input: { name: string; description?: string | null },
  sql: Sql = getSql(),
): Promise<Project> {
  const name = ProjectName.parse(input.name);
  const description = input.description ? ProjectDescription.parse(input.description) : null;
  const rows = await sql`
    INSERT INTO projects (name, description) VALUES (${name}, ${description})
    RETURNING *, 0 AS chats`;
  return toProject(one(rows, 'Project'));
}

export async function updateProject(
  id: string,
  input: { name?: string; description?: string | null },
  sql: Sql = getSql(),
): Promise<Project> {
  const name = input.name === undefined ? null : ProjectName.parse(input.name);
  const setDescription = input.description !== undefined;
  const description = input.description ? ProjectDescription.parse(input.description) : null;
  const rows = await sql`
    UPDATE projects SET
      name = coalesce(${name}, name),
      description = CASE WHEN ${setDescription} THEN ${description} ELSE description END,
      updated_at = now()
    WHERE id = ${Uuid.parse(id)}
    RETURNING id`;
  one(rows, 'Project');
  return getProject(id, sql);
}

/** Chats in the project stay; they move back to the general list. */
export async function deleteProject(id: string, sql: Sql = getSql()): Promise<void> {
  const rows = await sql`DELETE FROM projects WHERE id = ${Uuid.parse(id)} RETURNING id`;
  one(rows, 'Project');
}

// Chats -----------------------------------------------------------------------------------

export async function listChats(
  options: { search?: string; projectId?: string } = {},
  sql: Sql = getSql(),
): Promise<ChatSummary[]> {
  const search = options.search?.trim();
  const pattern = search ? `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  const project = options.projectId === undefined ? null : Uuid.parse(options.projectId);
  const rows = await sql`
    SELECT c.* FROM chats c
    WHERE (${project}::uuid IS NULL OR c.project_id = ${project})
      AND (${pattern}::text IS NULL OR c.title ILIKE ${pattern}
        OR EXISTS (SELECT 1 FROM turns t WHERE t.chat_id = c.id AND t.question ILIKE ${pattern}))
    ORDER BY c.pinned DESC, c.updated_at DESC, c.id
    LIMIT 500`;
  return rows.map(toChat);
}

export async function getChat(
  id: string,
  sql: Sql = getSql(),
): Promise<ChatSummary & { turns: SavedTurn[] }> {
  const chat = toChat(one(await sql`SELECT * FROM chats WHERE id = ${Uuid.parse(id)}`, 'Chat'));
  const turns = await sql`SELECT * FROM turns WHERE chat_id = ${chat.id} ORDER BY position`;
  return { ...chat, turns: turns.map(toTurn) };
}

export async function createChat(
  input: { question?: string; title?: string; projectId?: string | null },
  sql: Sql = getSql(),
): Promise<ChatSummary> {
  const title = input.title
    ? ChatTitle.parse(input.title)
    : chatTitle(ChatTitle.parse(input.question ?? 'New chat'));
  const source = input.title ? 'user' : 'auto';
  const project = input.projectId ? Uuid.parse(input.projectId) : null;
  const rows = await sql`
    INSERT INTO chats (title, title_source, project_id) VALUES (${title}, ${source}, ${project})
    RETURNING *`;
  return toChat(one(rows, 'Chat'));
}

/** Rename (title_source becomes 'user'), move (projectId, null = no project) or pin. */
export async function updateChat(
  id: string,
  input: { title?: string; projectId?: string | null; pinned?: boolean },
  sql: Sql = getSql(),
): Promise<ChatSummary> {
  const title = input.title === undefined ? null : ChatTitle.parse(input.title);
  const moveProject = input.projectId !== undefined;
  const project = input.projectId ? Uuid.parse(input.projectId) : null;
  const pinned = input.pinned ?? null;
  const rows = await sql`
    UPDATE chats SET
      title = coalesce(${title}, title),
      title_source = CASE WHEN ${title}::text IS NULL THEN title_source ELSE 'user' END,
      project_id = CASE WHEN ${moveProject} THEN ${project}::uuid ELSE project_id END,
      pinned = coalesce(${pinned}::boolean, pinned),
      updated_at = CASE WHEN ${title}::text IS NULL AND ${pinned}::boolean IS NULL
        AND NOT ${moveProject} THEN updated_at ELSE now() END
    WHERE id = ${Uuid.parse(id)}
    RETURNING *`;
  return toChat(one(rows, 'Chat'));
}

export async function deleteChat(id: string, sql: Sql = getSql()): Promise<void> {
  one(await sql`DELETE FROM chats WHERE id = ${Uuid.parse(id)} RETURNING id`, 'Chat');
}

/** D-144: `reset --chats` and Settings › Delete all chats. Returns how many chats were removed. */
export async function deleteAllChats(sql: Sql = getSql()): Promise<number> {
  return sql.begin(async (tx) => {
    const [row] = await tx<{ count: number }[]>`SELECT count(*)::integer AS count FROM chats`;
    await tx`TRUNCATE turns, chats, projects`;
    return row?.count ?? 0;
  });
}

/** Appends a finished turn; positions are dense per chat. */
export async function appendTurn(
  chatId: string,
  input: {
    question: string;
    standaloneQuestion?: string | null;
    answer: TurnAnswer;
    status: TurnStatus;
  },
  sql: Sql = getSql(),
): Promise<SavedTurn> {
  const id = Uuid.parse(chatId);
  const answer = TurnAnswer.parse(input.answer);
  const status = TurnStatus.parse(input.status);
  return sql.begin(async (tx) => {
    one(await tx`SELECT id FROM chats WHERE id = ${id} FOR UPDATE`, 'Chat');
    const rows = await tx`
      INSERT INTO turns (chat_id, position, question, standalone_question, answer, status)
      VALUES (${id},
        (SELECT coalesce(max(position) + 1, 0) FROM turns WHERE chat_id = ${id}),
        ${input.question}, ${input.standaloneQuestion ?? null}, ${tx.json(answer)}, ${status})
      RETURNING *`;
    await tx`UPDATE chats SET updated_at = now() WHERE id = ${id}`;
    return toTurn(one(rows, 'Turn'));
  });
}
