import { describe, expect, it } from 'vitest';
import { createSseParser, type RawSse } from '@/lib/sse/parse';
import { streams } from '../fixtures/sse-streams';

describe('TC-069 / UT-14 / FR-23: incremental SSE parsing', () => {
  for (const fixture of streams) {
    for (const newline of ['\n', '\r\n', '\r']) {
      const wire = fixture.wire.replaceAll('\n', newline);
      it(`${fixture.name}, ${JSON.stringify(newline)}: every two-chunk split`, () => {
        for (let split = 0; split <= wire.length; split++) {
          const events: RawSse[] = [];
          const parser = createSseParser((event) => events.push(event));
          parser.push(wire.slice(0, split));
          parser.push(wire.slice(split));
          parser.end();
          expect(events).toEqual(fixture.expected);
        }
      });
      it(`${fixture.name}, ${JSON.stringify(newline)}: byte-by-byte UTF-8 replay`, () => {
        const events: RawSse[] = [];
        const parser = createSseParser((event) => events.push(event));
        const decoder = new TextDecoder();
        for (const byte of new TextEncoder().encode(wire)) {
          parser.push(decoder.decode(Uint8Array.of(byte), { stream: true }));
        }
        parser.push(decoder.decode());
        parser.end();
        expect(events).toEqual(fixture.expected);
      });
    }
  }
  it('dispatches on a blank line before end, holds a split CRLF, and resets event names', () => {
    const events: RawSse[] = [];
    const parser = createSseParser((event) => events.push(event));
    parser.push('event: token\r');
    parser.push('\ndata: first\r');
    expect(events).toEqual([]);
    parser.push('\n\r');
    expect(events).toEqual([]);
    parser.push('\ndata: second\n\n');
    expect(events).toEqual([
      { event: 'token', data: 'first' },
      { event: 'message', data: 'second' },
    ]);
    parser.end();
    expect(events).toHaveLength(2);
  });
  it('ignores empty streams and comments at EOF', () => {
    for (const wire of ['', ': ping', '\n\n']) {
      const events: RawSse[] = [];
      const parser = createSseParser((event) => events.push(event));
      parser.push(wire);
      parser.end();
      expect(events).toEqual([]);
    }
  });
});
