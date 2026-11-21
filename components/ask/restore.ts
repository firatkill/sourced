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

/**
 * D-154: the reverse, for the hosted demo's tab storage — a finished phase becomes the turn the
 * server would have saved. Null while the turn is still running, or when it never reached
 * retrieval (the server saves nothing then either).
 */
export function savedTurn(
  phase: ChatTurn['phase'],
  citations: ChatTurn['citations'],
): Saved | null {
  if (phase.kind === 'done')
    return {
      question: phase.question,
      status: phase.citations.notFound ? 'not_found' : 'done',
      answer: {
        meta: phase.meta,
        answerText: phase.citations.answer,
        citations: phase.citations,
        done: phase.done,
      },
    };
  if (phase.kind === 'notFound' && phase.meta)
    return {
      question: phase.question,
      status: 'not_found',
      answer: { meta: phase.meta, answerText: '', citations: citations ?? null, done: phase.done },
    };
  if (phase.kind === 'stopped' && phase.meta)
    return {
      question: phase.question,
      status: 'stopped',
      answer: { meta: phase.meta, answerText: phase.partialText, citations: null, done: null },
    };
  return null;
}
