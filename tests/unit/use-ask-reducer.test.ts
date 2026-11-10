// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  askReducer,
  askStatus,
  askStream,
  initialAskState,
  useAsk,
  type AskState,
  type Phase,
} from '@/hooks/useAsk';
import type { SseEvent } from '@/lib/sse/events';

const question = 'How do indexes work?';
const requestId = '00000000-0000-4000-8000-000000000001';
const meta: Extract<SseEvent, { event: 'meta' }>['data'] = {
  requestId,
  cached: false,
  cachedAt: null,
  passages: [],
  retrieval: {
    vectorCandidates: 0,
    ftsCandidates: 0,
    rerankFallback: false,
    rerankFallbackReason: null,
    timingsMs: { embed: 1, search: 2, rerank: 3 },
  },
};
const citations: Extract<SseEvent, { event: 'citations' }>['data'] = {
  answer: 'Verified [P1]',
  notFound: false,
  valid: [{ label: 'P1', quote: 'a supporting quote here', quoteSpan: { start: 0, end: 23 } }],
  invalid: [],
  quoteFallbackUsed: false,
};
const done: Extract<SseEvent, { event: 'done' }>['data'] = {
  requestId,
  cached: false,
  usage: { embeddingTokens: 0, inputTokens: 1, outputTokens: 2 },
  costUsdEstimate: 0,
  latencyMs: { total: 10, firstToken: 1, generation: 9 },
};
const wrap = (phase: Phase): AskState => ({ phase, question, citations: null });
const submitting = wrap({ kind: 'submitting', question });
const streaming = wrap({ kind: 'streaming', question, meta, text: 'Draft' });
const verifying = wrap({ kind: 'verifying', question, meta, text: 'Draft' });
const holding = { ...verifying, citations };
const notFound: AskState = {
  ...wrap({ kind: 'notFound', question, meta, done: null }),
  citations: { ...citations, answer: '', notFound: true, valid: [] },
};
const completed = wrap({ kind: 'done', question, meta, citations, done });
const stopped = wrap({ kind: 'stopped', question, partialText: 'Draft', meta });
const inFlight = [submitting, streaming, verifying, holding, notFound];
const terminal = [
  completed,
  stopped,
  wrap({ kind: 'notFound', question, meta, done }),
  wrap({ kind: 'rateLimited', scope: 'ip', resetAt: '2026-11-10T00:00:00Z' }),
  initialAskState('readonly'),
  initialAskState('off'),
  wrap({ kind: 'providerError', question, refunded: true, requestId }),
  wrap({ kind: 'serverError', question, requestId }),
  wrap({ kind: 'networkError', question, partialText: 'Draft' }),
];

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('UT-20 / TC-087 — TRD §15.4 transition rows (FR-03, FR-04, FR-09–FR-11)', () => {
  it('idle, any terminal | submit (client validation fails) | validationError', () => {
    for (const state of [initialAskState('on'), ...terminal]) {
      for (const [input, message] of [
        ['  ', 'Type a question first.'],
        ['ab', 'That’s too short to search for. Try a full question.'],
        ['x'.repeat(501), 'Questions can be up to 500 characters. Yours is 501.'],
      ]) {
        expect(askReducer(state, { type: 'submit', question: input! }).phase).toEqual({
          kind: 'validationError',
          message,
        });
      }
    }
  });
  it('idle, validationError, any terminal | submit (valid) | submitting', () => {
    for (const state of [
      initialAskState('on'),
      wrap({ kind: 'validationError', message: 'Type a question first.' }),
      ...terminal,
    ]) {
      expect(askReducer(state, { type: 'submit', question })).toEqual(submitting);
    }
  });
  it('submitting | meta | streaming (text empty)', () => {
    expect(askReducer(submitting, { event: 'meta', data: meta }).phase).toEqual({
      kind: 'streaming',
      question,
      meta,
      text: '',
    });
  });
  it('streaming | token | streaming (text += delta)', () => {
    expect(askReducer(streaming, { event: 'token', data: { delta: ' more' } }).phase).toEqual({
      ...streaming.phase,
      text: 'Draft more',
    });
  });
  it('streaming | 600 ms without a token after at least one token | verifying', () => {
    expect(askReducer(streaming, { type: 'verify' })).toEqual(verifying);
    const empty = wrap({ kind: 'streaming', question, meta, text: '' });
    expect(askReducer(empty, { type: 'verify' })).toBe(empty);
  });
  it('verifying (not holding citations) | token | streaming (D-77)', () => {
    expect(askReducer(verifying, { event: 'token', data: { delta: ' again' } }).phase).toEqual({
      ...streaming.phase,
      text: 'Draft again',
    });
    expect(askReducer(holding, { event: 'token', data: { delta: ' ignored' } })).toBe(holding);
  });
  it('streaming, verifying | citations with notFound false | verifying holding citations', () => {
    for (const state of [streaming, verifying])
      expect(askReducer(state, { event: 'citations', data: citations })).toEqual(holding);
  });
  it('streaming, verifying | citations with notFound true | notFound holding', () => {
    for (const state of [streaming, verifying])
      expect(askReducer(state, { event: 'citations', data: notFound.citations! })).toEqual(
        notFound,
      );
    expect(notFound.phase).not.toHaveProperty('text');
  });
  it('verifying (holding citations) | done | done', () => {
    expect(askReducer(holding, { event: 'done', data: done }).phase).toEqual(completed.phase);
  });
  it('notFound (holding) | done | notFound with done attached', () => {
    expect(askReducer(notFound, { event: 'done', data: done }).phase).toEqual({
      ...notFound.phase,
      done,
    });
  });
  it('any in-flight | error PROVIDER_* | providerError', () => {
    for (const state of inFlight)
      for (const code of ['PROVIDER_ERROR', 'PROVIDER_TIMEOUT'] as const)
        for (const refunded of [true, false]) {
          expect(
            askReducer(state, {
              event: 'error',
              data: { code, refunded, requestId, retryable: true, message: 'provider detail' },
            }).phase,
          ).toEqual({ kind: 'providerError', question, refunded, requestId });
        }
  });
  it('any in-flight | error RETRIEVAL_ERROR / INTERNAL_ERROR | serverError', () => {
    for (const state of inFlight)
      for (const code of ['RETRIEVAL_ERROR', 'INTERNAL_ERROR'] as const) {
        expect(
          askReducer(state, {
            event: 'error',
            data: { code, refunded: true, requestId, retryable: true, message: 'server detail' },
          }).phase,
        ).toEqual({ kind: 'serverError', question, requestId });
      }
  });
  it('any in-flight | HTTP 429 | rateLimited', () => {
    for (const state of inFlight)
      for (const code of ['RATE_LIMITED_IP', 'RATE_LIMITED_GLOBAL'] as const) {
        expect(
          askReducer(state, {
            type: 'httpError',
            status: 429,
            body: { code, requestId, resetAt: '2026-11-10T00:00:00Z' },
          }).phase,
        ).toEqual({
          kind: 'rateLimited',
          scope: code === 'RATE_LIMITED_IP' ? 'ip' : 'global',
          resetAt: '2026-11-10T00:00:00Z',
        });
      }
  });
  it('any in-flight | HTTP 503 DEMO_READONLY / DEMO_OFF | readonly / demoOff', () => {
    for (const state of inFlight)
      for (const code of ['DEMO_READONLY', 'DEMO_OFF'] as const) {
        expect(
          askReducer(state, { type: 'httpError', status: 503, body: { code, requestId } }).phase
            .kind,
        ).toBe(code === 'DEMO_READONLY' ? 'readonly' : 'demoOff');
      }
  });
  it('any in-flight | HTTP 400 | validationError mapped by details.reason', () => {
    for (const state of inFlight)
      for (const [reason, message] of [
        ['required', 'Type a question first.'],
        ['too_short', 'That’s too short to search for. Try a full question.'],
        ['too_long', 'Questions can be up to 500 characters. Yours is 501.'],
      ]) {
        expect(
          askReducer(state, {
            type: 'httpError',
            status: 400,
            body: { code: 'VALIDATION_FAILED', requestId, details: { reason, length: 501 } },
          }).phase,
        ).toEqual({ kind: 'validationError', message });
      }
  });
  it('any in-flight | HTTP 413 | validationError with question length', () => {
    for (const state of inFlight)
      expect(
        askReducer(
          { ...state, question: 'x'.repeat(502) },
          { type: 'httpError', status: 413, body: { code: 'PAYLOAD_TOO_LARGE', requestId } },
        ).phase,
      ).toEqual({
        kind: 'validationError',
        message: 'Questions can be up to 500 characters. Yours is 502.',
      });
  });
  it('any in-flight | HTTP 403, 415, 500 or any other non-2xx | serverError', () => {
    for (const state of inFlight)
      for (const status of [403, 415, 500, 502, 503, 418])
        expect(
          askReducer(state, {
            type: 'httpError',
            status,
            body: { code: 'INTERNAL_ERROR', requestId },
          }).phase,
        ).toEqual({ kind: 'serverError', question, requestId });
  });
  it('any in-flight | stream ends without terminal event, fetch rejects | networkError', () => {
    for (const state of inFlight)
      expect(askReducer(state, { type: 'networkError' }).phase).toEqual({
        kind: 'networkError',
        question,
        partialText: [streaming, verifying, holding].includes(state) ? 'Draft' : '',
      });
  });
  it('any in-flight | user Stop | stopped', () => {
    for (const state of inFlight)
      expect(askReducer(state, { type: 'stop' }).phase).toEqual({
        kind: 'stopped',
        question,
        partialText: [streaming, verifying, holding].includes(state) ? 'Draft' : '',
        meta: state === submitting ? null : meta,
      });
  });
  it('done, notFound, stopped | Ask another question | idle keeping question', () => {
    for (const state of [
      completed,
      notFound,
      { ...notFound, phase: { ...notFound.phase, done } as Phase },
      stopped,
    ])
      expect(askReducer(state, { type: 'another' })).toEqual({
        phase: { kind: 'idle' },
        question,
        citations: null,
      });
  });
});

function wire(event: SseEvent): string {
  return `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
}
function response(text: string) {
  return new Response(new TextEncoder().encode(text));
}
function handlers() {
  return {
    onEvent: vi.fn<(event: SseEvent) => void>(),
    onHttpError: vi.fn(),
    onNetworkError: vi.fn(),
  };
}
const sequence: SseEvent[] = [
  { event: 'meta', data: meta },
  { event: 'token', data: { delta: 'Draft' } },
  { event: 'citations', data: citations },
  { event: 'done', data: done },
];

describe('TRD §12.4 client transport', () => {
  it('POSTs the request and validates events, ignoring unknown names and heartbeats', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        response(': ping\n\nevent: future\ndata: not JSON\n\n' + sequence.map(wire).join('')),
      );
    vi.stubGlobal('fetch', fetch);
    const callbacks = handlers();
    const signal = new AbortController().signal;
    await askStream({ question, suggestedId: 'partial' }, callbacks, signal);
    expect(fetch).toHaveBeenCalledWith(
      '/api/ask',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ question, suggestedId: 'partial' }),
        signal,
      }),
    );
    expect(callbacks.onEvent.mock.calls.map(([event]) => event)).toEqual(sequence);
    expect(callbacks.onNetworkError).not.toHaveBeenCalled();
  });
  it.each([
    'event: token\ndata: {bad}\n\n',
    'event: token\ndata: {"delta":0}\n\n',
    wire(sequence[0]!),
  ])('malformed or incomplete stream produces network error: %s', async (text) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(text)));
    const callbacks = handlers();
    await askStream({ question }, callbacks, new AbortController().signal);
    expect(callbacks.onNetworkError).toHaveBeenCalledOnce();
  });
  it('maps non-2xx bodies and falls back to the response request ID', async () => {
    const error = { code: 'INTERNAL_ERROR', requestId, message: 'safe message' };
    for (const body of [JSON.stringify({ error }), 'not JSON', '{}']) {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            new Response(body, { status: 500, headers: { 'X-Request-Id': requestId } }),
          ),
      );
      const callbacks = handlers();
      await askStream({ question }, callbacks, new AbortController().signal);
      expect(callbacks.onHttpError).toHaveBeenCalledWith(
        500,
        expect.objectContaining({ code: 'INTERNAL_ERROR', requestId }),
      );
      expect(callbacks.onNetworkError).not.toHaveBeenCalled();
    }
  });
  it('fetch rejection is network error; AbortError is not', async () => {
    for (const error of [new Error('offline'), new DOMException('Stopped', 'AbortError')]) {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(error));
      const callbacks = handlers();
      await askStream({ question }, callbacks, new AbortController().signal);
      expect(callbacks.onNetworkError).toHaveBeenCalledTimes(error.name === 'AbortError' ? 0 : 1);
    }
  });
  it('an SSE error is terminal and does not become a network error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response(
          wire({
            event: 'error',
            data: {
              code: 'PROVIDER_TIMEOUT',
              message: 'safe',
              requestId,
              refunded: true,
              retryable: true,
            },
          }),
        ),
      ),
    );
    const callbacks = handlers();
    await askStream({ question }, callbacks, new AbortController().signal);
    expect(callbacks.onEvent).toHaveBeenCalledOnce();
    expect(callbacks.onNetworkError).not.toHaveBeenCalled();
  });
});

async function openStream() {
  let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
    },
  });
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(stream));
  vi.stubGlobal('fetch', fetch);
  const hook = renderHook(() => useAsk());
  let pending: Promise<void> | undefined;
  await act(async () => {
    pending = hook.result.current.submit(question);
    await Promise.resolve();
  });
  const emit = async (event: SseEvent) => {
    await act(async () => {
      streamController!.enqueue(new TextEncoder().encode(wire(event)));
      await Promise.resolve();
    });
  };
  const finish = async () => {
    await act(async () => {
      streamController!.close();
      await pending;
    });
  };
  return { ...hook, fetch, emit, finish, pending: () => pending };
}

describe('useAsk orchestration — FR-03/04/10/11, D-77', () => {
  it('initial demo modes and derived status copy match the spec', () => {
    expect(initialAskState('readonly').phase.kind).toBe('readonly');
    expect(initialAskState('off').phase.kind).toBe('demoOff');
    expect(askStatus(submitting.phase)).toBe('Searching the docs…');
    expect(askStatus({ kind: 'streaming', question, meta, text: '' })).toBe('Reading 0 passages…');
    expect(askStatus(streaming.phase)).toBe('Writing the answer…');
    expect(askStatus(verifying.phase)).toBe('Checking citations…');
  });
  it('batches tokens per animation frame, verifies after 600 ms, and restarts on late tokens', async () => {
    vi.useFakeTimers();
    const hook = await openStream();
    await hook.emit({ event: 'meta', data: meta });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(hook.result.current.phase.kind).toBe('streaming');
    await hook.emit({ event: 'token', data: { delta: 'A' } });
    await hook.emit({ event: 'token', data: { delta: 'B' } });
    expect(hook.result.current.phase).toMatchObject({ text: '' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(16);
    });
    expect(hook.result.current.phase).toMatchObject({ kind: 'streaming', text: 'AB' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(583);
    });
    expect(hook.result.current.phase.kind).toBe('streaming');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(hook.result.current.phase.kind).toBe('verifying');
    await hook.emit({ event: 'token', data: { delta: 'C' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(16);
    });
    expect(hook.result.current.phase).toMatchObject({ kind: 'streaming', text: 'ABC' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(584);
    });
    expect(hook.result.current.phase.kind).toBe('verifying');
    await hook.emit({ event: 'citations', data: citations });
    await hook.emit({ event: 'done', data: done });
    await act(async () => {
      await hook.pending();
    });
    expect(hook.result.current.phase).toEqual(completed.phase);
  });
  it('Stop aborts, retains buffered text, and Ask another preserves and selects the input', async () => {
    vi.useFakeTimers();
    const hook = await openStream();
    await hook.emit({ event: 'meta', data: meta });
    await hook.emit({ event: 'token', data: { delta: 'Draft' } });
    const input = document.createElement('textarea');
    input.value = question;
    document.body.append(input);
    hook.result.current.inputRef.current = input;
    act(() => {
      hook.result.current.stop();
    });
    expect(hook.fetch.mock.calls[0]![1]?.signal?.aborted).toBe(true);
    expect(hook.result.current.phase).toEqual(stopped.phase);
    act(() => {
      hook.result.current.askAnother();
    });
    expect(hook.result.current.question).toBe(question);
    expect(hook.result.current.phase.kind).toBe('idle');
    expect(document.activeElement).toBe(input);
    expect(input.selectionEnd - input.selectionStart).toBe(question.length);
    input.remove();
    await hook.finish();
  });
  it('pending notFound stream closure becomes networkError without exposing the draft', async () => {
    const hook = await openStream();
    await hook.emit({ event: 'meta', data: meta });
    await hook.emit({ event: 'citations', data: notFound.citations! });
    expect(hook.result.current.inFlight).toBe(true);
    await hook.finish();
    expect(hook.result.current.phase).toEqual({ kind: 'networkError', question, partialText: '' });
  });
  it('client validation prevents fetch and an in-flight submit cannot start a second request', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal('fetch', fetch);
    const hook = renderHook(() => useAsk());
    await act(async () => {
      await hook.result.current.submit(' ');
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(hook.result.current.phase).toEqual({
      kind: 'validationError',
      message: 'Type a question first.',
    });
    hook.unmount();
    const live = await openStream();
    await act(async () => {
      await live.result.current.submit('Another question?');
    });
    expect(live.fetch).toHaveBeenCalledOnce();
    await live.finish();
  });
  it('a stopped request cannot overwrite a newer completed request', async () => {
    let resolveOld: ((value: Response) => void) | undefined;
    const old = new Promise<Response>((resolve) => {
      resolveOld = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof globalThis.fetch>()
        .mockReturnValueOnce(old)
        .mockResolvedValue(response(sequence.map(wire).join(''))),
    );
    const hook = renderHook(() => useAsk());
    let first: Promise<void> | undefined;
    act(() => {
      first = hook.result.current.submit('Old question?');
    });
    act(() => {
      hook.result.current.stop();
      hook.result.current.askAnother();
    });
    await act(async () => {
      await hook.result.current.submit(question);
    });
    expect(hook.result.current.phase).toEqual(completed.phase);
    await act(async () => {
      resolveOld!(response(sequence.map(wire).join('')));
      await first;
    });
    expect(hook.result.current.phase).toEqual(completed.phase);
  });
  it('unmount aborts the request and cancels scheduled updates', async () => {
    vi.useFakeTimers();
    const hook = await openStream();
    await hook.emit({ event: 'meta', data: meta });
    await hook.emit({ event: 'token', data: { delta: 'pending' } });
    hook.unmount();
    expect(hook.fetch.mock.calls[0]![1]?.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    await hook.finish();
  });
});

it.each(['CONFIG_INVALID', 'CORPUS_MISMATCH', 'CORPUS_EMPTY'] as const)(
  'T-47 / TRD §30.3: client maps %s safely',
  (code) => {
    const state = askReducer(submitting, {
      type: 'httpError',
      status: 500,
      body: { code, requestId },
    });
    expect(state.phase.kind).toBe(code === 'CORPUS_EMPTY' ? 'notFound' : 'serverError');
  },
);
