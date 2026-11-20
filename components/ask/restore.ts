import type { TurnAnswer, TurnStatus } from '@/lib/chats/schema';
import type { ChatTurn } from './Turn';

type Saved = { question: string; status: TurnStatus; answer: TurnAnswer };

/** T-84: a saved turn becomes the same finished state the live stream would have left. */
export function restoreTurn(saved: Saved, id: number): ChatTurn {
  const { question, status, answer } = saved;
  const base = { id, question, citations: answer.citations };
  if (status === 'done' && answer.citations && answer.done)
    return {
      ...base,
      phase: {
        kind: 'done',
        question,
        meta: answer.meta,
        citations: answer.citations,
        done: answer.done,
      },
    };
  if (status === 'not_found' || (status === 'done' && answer.citations?.notFound))
    return { ...base, phase: { kind: 'notFound', question, meta: answer.meta, done: answer.done } };
  if (status === 'stopped')
    return {
      ...base,
      phase: { kind: 'stopped', question, partialText: answer.answerText, meta: answer.meta },
    };
  return { ...base, phase: { kind: 'serverError', question, requestId: answer.meta.requestId } };
}
