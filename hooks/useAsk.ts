'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { QUESTION } from '@/lib/config';
import { ErrorBody } from '@/lib/errors';
import { SseEvent } from '@/lib/sse/events';
import { createSseParser } from '@/lib/sse/parse';
import type { SuggestedId } from '@/lib/suggested';

type MetaEvent = Extract<SseEvent, { event: 'meta' }>['data'];
type CitationsEvent = Extract<SseEvent, { event: 'citations' }>['data'];
type DoneEvent = Extract<SseEvent, { event: 'done' }>['data'];

export type Phase =
  | { kind: 'idle' }
  | { kind: 'validationError'; message: string }
  | { kind: 'submitting'; question: string }
  | { kind: 'streaming'; question: string; meta: MetaEvent; text: string }
  | { kind: 'verifying'; question: string; meta: MetaEvent; text: string }
  | { kind: 'done'; question: string; meta: MetaEvent; citations: CitationsEvent; done: DoneEvent }
  | { kind: 'notFound'; question: string; meta: MetaEvent | null; done: DoneEvent | null }
  | { kind: 'rateLimited'; scope: 'ip' | 'global'; resetAt: string }
  | { kind: 'readonly' }
  | { kind: 'demoOff' }
  | { kind: 'providerError'; question: string; refunded: boolean; requestId: string }
  | { kind: 'serverError'; question: string; requestId: string }
  | { kind: 'networkError'; question: string; partialText: string }
  | { kind: 'stopped'; question: string; partialText: string; meta: MetaEvent | null };

export type AskState = { phase: Phase; question: string; citations: CitationsEvent | null };
export type HttpError = Omit<ReturnType<typeof ErrorBody.parse>['error'], 'message'>;
export type AskAction =
  | SseEvent
  | { type: 'input'; question: string }
  | { type: 'submit'; question: string }
  | { type: 'verify' }
  | { type: 'httpError'; status: number; body: HttpError }
  | { type: 'networkError' }
  | { type: 'stop' }
  | { type: 'another' };

export function isInFlight(phase: Phase): boolean {
  return (
    phase.kind === 'submitting' ||
    phase.kind === 'streaming' ||
    phase.kind === 'verifying' ||
    (phase.kind === 'notFound' && phase.meta !== null && phase.done === null)
  );
}

export function initialAskState(demoMode: 'on' | 'readonly' | 'off'): AskState {
  return {
    phase: { kind: demoMode === 'on' ? 'idle' : demoMode === 'off' ? 'demoOff' : 'readonly' },
    question: '',
    citations: null,
  };
}

function tooLong(length: number): string {
  return `Questions can be up to ${String(QUESTION.MAX_CHARS)} characters. Yours is ${String(length)}.`;
}

function validationMessage(question: string): string | null {
  const length = question.trim().length;
  if (length === 0) return 'Type a question first.';
  if (length < QUESTION.MIN_CHARS) return 'That’s too short to search for. Try a full question.';
  if (length > QUESTION.MAX_CHARS) return tooLong(length);
  return null;
}

export function askReducer(state: AskState, action: AskAction): AskState {
  const { phase } = state;
  const change = (next: Phase, citations: CitationsEvent | null = null): AskState => ({
    ...state,
    phase: next,
    citations,
  });
  if ('event' in action) {
    switch (action.event) {
      case 'meta':
        return phase.kind === 'submitting'
          ? change({ kind: 'streaming', question: phase.question, meta: action.data, text: '' })
          : state;
      case 'token':
        return phase.kind === 'streaming' ||
          (phase.kind === 'verifying' && state.citations === null)
          ? change({ ...phase, kind: 'streaming', text: phase.text + action.data.delta })
          : state;
      case 'citations':
        if (phase.kind !== 'streaming' && phase.kind !== 'verifying') return state;
        return change(
          action.data.notFound
            ? { kind: 'notFound', question: phase.question, meta: phase.meta, done: null }
            : { ...phase, kind: 'verifying' },
          action.data,
        );
      case 'done':
        if (phase.kind === 'notFound' && phase.meta !== null && phase.done === null)
          return change({ ...phase, done: action.data }, state.citations);
        if (phase.kind === 'verifying' && state.citations !== null)
          return change(
            {
              kind: 'done',
              question: phase.question,
              meta: phase.meta,
              citations: state.citations,
              done: action.data,
            },
            state.citations,
          );
        return state;
      case 'error':
        if (!isInFlight(phase)) return state;
        return change(
          action.data.code === 'PROVIDER_ERROR' || action.data.code === 'PROVIDER_TIMEOUT'
            ? {
                kind: 'providerError',
                question: state.question,
                refunded: action.data.refunded,
                requestId: action.data.requestId,
              }
            : { kind: 'serverError', question: state.question, requestId: action.data.requestId },
        );
      default: {
        const unreachable: never = action;
        return unreachable;
      }
    }
  }
  switch (action.type) {
    case 'input':
      return isInFlight(phase) ? state : { ...state, question: action.question };
    case 'submit': {
      if (isInFlight(phase)) return state;
      const message = validationMessage(action.question);
      return {
        question: action.question,
        citations: null,
        phase:
          message === null
            ? { kind: 'submitting', question: action.question }
            : { kind: 'validationError', message },
      };
    }
    case 'verify':
      return phase.kind === 'streaming' && phase.text !== ''
        ? change({ ...phase, kind: 'verifying' })
        : state;
    case 'httpError': {
      if (!isInFlight(phase)) return state;
      const { status, body } = action;
      if (body.code === 'CORPUS_EMPTY')
        return change({ kind: 'notFound', question: state.question, meta: null, done: null });
      if (
        body.code === 'CONFIG_INVALID' ||
        body.code === 'CORPUS_MISMATCH' ||
        body.code === 'NEEDS_CONFIRMATION' ||
        body.code === 'CHECKS_FAILED'
      )
        return change({ kind: 'serverError', question: state.question, requestId: body.requestId });
      if (
        status === 429 &&
        body.resetAt !== undefined &&
        (body.code === 'RATE_LIMITED_IP' || body.code === 'RATE_LIMITED_GLOBAL')
      )
        return change({
          kind: 'rateLimited',
          scope: body.code === 'RATE_LIMITED_IP' ? 'ip' : 'global',
          resetAt: body.resetAt,
        });
      if (status === 503 && (body.code === 'DEMO_READONLY' || body.code === 'DEMO_OFF'))
        return change({ kind: body.code === 'DEMO_READONLY' ? 'readonly' : 'demoOff' });
      if (status === 413)
        return change({ kind: 'validationError', message: tooLong(state.question.length) });
      if (status === 400) {
        const reason = body.details?.reason;
        const message =
          reason === 'required'
            ? 'Type a question first.'
            : reason === 'too_short'
              ? 'That’s too short to search for. Try a full question.'
              : reason === 'too_long'
                ? tooLong(
                    typeof body.details?.length === 'number'
                      ? body.details.length
                      : state.question.length,
                  )
                : 'Something went wrong on our side';
        return change({ kind: 'validationError', message });
      }
      return change({ kind: 'serverError', question: state.question, requestId: body.requestId });
    }
    case 'networkError':
      return isInFlight(phase)
        ? change({
            kind: 'networkError',
            question: state.question,
            partialText: phase.kind === 'streaming' || phase.kind === 'verifying' ? phase.text : '',
          })
        : state;
    case 'stop':
      return isInFlight(phase)
        ? change({
            kind: 'stopped',
            question: state.question,
            partialText: phase.kind === 'streaming' || phase.kind === 'verifying' ? phase.text : '',
            meta: 'meta' in phase ? phase.meta : null,
          })
        : state;
    case 'another':
      return phase.kind === 'done' || phase.kind === 'notFound' || phase.kind === 'stopped'
        ? change({ kind: 'idle' })
        : state;
    default: {
      const unreachable: never = action;
      return unreachable;
    }
  }
}

export function askStatus(phase: Phase): string {
  if (phase.kind === 'submitting') return 'Searching the docs…';
  if (phase.kind === 'streaming')
    return phase.text === ''
      ? `Reading ${String(phase.meta.passages.length)} passages…`
      : 'Writing the answer…';
  if (phase.kind === 'verifying') return 'Checking citations…';
  return '';
}

type AskRequest = { question: string; suggestedId?: SuggestedId };
type StreamHandlers = {
  onEvent: (event: SseEvent) => void;
  onHttpError: (status: number, body: HttpError) => void;
  onNetworkError: () => void;
};

export async function askStream(
  request: AskRequest,
  handlers: StreamHandlers,
  signal: AbortSignal,
): Promise<void> {
  const isAborted = () => signal.aborted;
  let reader: ReadableStreamDefaultReader<string> | undefined;
  try {
    const response = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(request),
      signal,
    });
    if (isAborted()) return;
    if (!response.ok) {
      const parsed = ErrorBody.safeParse(await response.json().catch(() => null));
      handlers.onHttpError(
        response.status,
        parsed.success
          ? parsed.data.error
          : { code: 'INTERNAL_ERROR', requestId: response.headers.get('x-request-id') ?? '' },
      );
      return;
    }
    if (!response.body) {
      handlers.onNetworkError();
      return;
    }
    const stream = { terminal: false };
    const parser = createSseParser(({ event, data }) => {
      if (stream.terminal || isAborted()) return;
      if (!SseEvent.options.some((option) => option.shape.event.value === event)) return;
      const parsed = SseEvent.safeParse({ event, data: JSON.parse(data) as unknown });
      if (!parsed.success) throw new Error('MALFORMED_STREAM');
      stream.terminal = parsed.data.event === 'done' || parsed.data.event === 'error';
      handlers.onEvent(parsed.data);
    });
    reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    while (!isAborted() && !stream.terminal) {
      const chunk = await reader.read();
      if (isAborted()) return;
      if (chunk.done) {
        parser.end();
        break;
      }
      parser.push(chunk.value);
    }
    if (!stream.terminal && !isAborted()) handlers.onNetworkError();
  } catch (error) {
    if (
      !isAborted() &&
      !(
        typeof error === 'object' &&
        error !== null &&
        'name' in error &&
        error.name === 'AbortError'
      )
    )
      handlers.onNetworkError();
  } finally {
    if (reader) {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }
}

export function useAsk(demoMode: 'on' | 'readonly' | 'off' = 'on') {
  const [state, dispatch] = useReducer(askReducer, demoMode, initialAskState);
  const current = useRef(initialAskState(demoMode));
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const active = useRef<{
    controller: AbortController;
    flush: () => void;
    clear: () => void;
  } | null>(null);
  const send = useCallback((action: AskAction) => {
    current.current = askReducer(current.current, action);
    dispatch(action);
  }, []);
  const cancel = useCallback(() => {
    const request = active.current;
    active.current = null;
    request?.clear();
    request?.controller.abort();
  }, []);
  useEffect(() => cancel, [cancel]);

  const submit = useCallback(
    async (question: string, suggestedId?: SuggestedId) => {
      if (isInFlight(current.current.phase)) return;
      cancel();
      send({ type: 'submit', question });
      if (current.current.phase.kind !== 'submitting') return;
      const controller = new AbortController();
      let frame: number | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let pending = '';
      const flush = () => {
        if (frame !== undefined) cancelAnimationFrame(frame);
        frame = undefined;
        if (pending !== '') {
          send({ event: 'token', data: { delta: pending } });
          pending = '';
        }
      };
      const clear = () => {
        if (frame !== undefined) cancelAnimationFrame(frame);
        clearTimeout(timer);
        pending = '';
      };
      active.current = { controller, flush, clear };
      const ownsRequest = () => active.current?.controller === controller;
      await askStream(
        { question, ...(suggestedId === undefined ? {} : { suggestedId }) },
        {
          onEvent(event) {
            if (!ownsRequest()) return;
            if (event.event === 'token') {
              pending += event.data.delta;
              frame ??= requestAnimationFrame(flush);
              clearTimeout(timer);
              timer = setTimeout(() => {
                flush();
                send({ type: 'verify' });
              }, 600);
            } else {
              flush();
              if (event.event !== 'meta') clearTimeout(timer);
              send(event);
            }
          },
          onHttpError(status, body) {
            if (ownsRequest()) {
              flush();
              if (status === 401 && body.code === 'ACCESS_DENIED') {
                window.location.assign(new URL('/access', window.location.href).href);
                return;
              }
              send({ type: 'httpError', status, body });
            }
          },
          onNetworkError() {
            if (ownsRequest()) {
              flush();
              send({ type: 'networkError' });
            }
          },
        },
        controller.signal,
      );
      if (ownsRequest()) {
        clear();
        active.current = null;
      }
    },
    [cancel, send],
  );

  const stop = useCallback(() => {
    active.current?.flush();
    send({ type: 'stop' });
    cancel();
  }, [cancel, send]);
  const askAnother = useCallback(() => {
    if (!['done', 'notFound', 'stopped'].includes(current.current.phase.kind)) return;
    cancel();
    send({ type: 'another' });
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [cancel, send]);
  const setQuestion = useCallback(
    (question: string) => {
      send({ type: 'input', question });
    },
    [send],
  );
  return {
    ...state,
    inputRef,
    setQuestion,
    submit,
    stop,
    askAnother,
    inFlight: isInFlight(state.phase),
    status: askStatus(state.phase),
  };
}
