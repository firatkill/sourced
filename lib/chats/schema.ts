import { z } from 'zod';
import { CitationsEvent, DoneEvent, MetaEvent } from '@/lib/sse/events';

/** REDESIGN-v2 §4: what a saved turn keeps, so a chat reads the same after re-ingest or reset. */
export const TurnStatus = z.enum(['done', 'not_found', 'stopped', 'error']);
export type TurnStatus = z.infer<typeof TurnStatus>;

export const TurnAnswer = z.object({
  meta: MetaEvent,
  answerText: z.string(),
  citations: CitationsEvent.nullable(),
  done: DoneEvent.nullable(),
});
export type TurnAnswer = z.infer<typeof TurnAnswer>;

export const CHAT_TITLE_MAX = 60;
export const ChatTitle = z.string().trim().min(1).max(120);
export const ProjectName = z.string().trim().min(1).max(80);
export const ProjectDescription = z.string().trim().max(300);

/** D-144: a chat's automatic title is its first question, cut at a word to 60 characters. */
export function chatTitle(question: string): string {
  const text = question.replace(/\s+/g, ' ').trim();
  if (text.length <= CHAT_TITLE_MAX) return text;
  const cut = text.slice(0, CHAT_TITLE_MAX - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space >= 30 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
