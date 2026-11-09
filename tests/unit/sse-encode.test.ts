import { afterEach, describe, expect, it, vi } from 'vitest';
import { SSE } from '@/lib/config';
import { encodeEvent, HEARTBEAT, startHeartbeat } from '@/lib/sse/encode';
import { eventExamples } from '../fixtures/sse-streams';

describe('TC-068 / UT-12 / FR-23: SSE wire encoding', () => {
  it.each(eventExamples)('encodes $event as one JSON data line', (event) => {
    const bytes = encodeEvent(event);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(bytes)).toBe(
      `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`,
    );
  });
  it('escapes newlines and preserves UTF-8', () => {
    expect(
      new TextDecoder().decode(
        encodeEvent({ event: 'token', data: { delta: 'İndex 🌱\n\r"quoted"' } }),
      ),
    ).toBe('event: token\ndata: {"delta":"İndex 🌱\\n\\r\\"quoted\\""}\n\n');
  });
  it('uses the exact heartbeat bytes', () => {
    expect([...HEARTBEAT]).toEqual([58, 32, 112, 105, 110, 103, 10, 10]);
  });
});

describe('TC-070 / FR-25: heartbeat lifecycle for the T-28 route', () => {
  afterEach(() => vi.useRealTimers());
  it('sends every 15 seconds while open and stops when the route closes', async () => {
    vi.useFakeTimers();
    let closeStream: () => void = () => {};
    const send = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const stop = startHeartbeat((bytes) => {
          send(bytes);
          controller.enqueue(bytes);
        });
        closeStream = () => {
          stop();
          controller.close();
        };
      },
    });
    const reader = stream.getReader();
    expect(SSE.HEARTBEAT_MS).toBe(15_000);
    vi.advanceTimersByTime(SSE.HEARTBEAT_MS - 1);
    expect(send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(await reader.read()).toEqual({ value: HEARTBEAT, done: false });
    vi.advanceTimersByTime(SSE.HEARTBEAT_MS);
    expect(await reader.read()).toEqual({ value: HEARTBEAT, done: false });
    vi.advanceTimersByTime(1);
    expect(send).toHaveBeenCalledTimes(2);
    closeStream();
    expect(await reader.read()).toEqual({ value: undefined, done: true });
    vi.advanceTimersByTime(SSE.HEARTBEAT_MS * 3);
    expect(send).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});
