import { describe, expect, test } from 'vitest';
import { GENERATION } from '@/lib/config';
import { createCitationSplitter } from '@/lib/generation/stream-splitter';

const delimiter = GENERATION.CITATIONS_DELIMITER;
const answer = 'PostgreSQL supports transactions. [P1]\n\n';
const block = '{"citations":[{"passageId":"P1","quote":"PostgreSQL supports transactions"}]}';

describe('TC-064: UT-07 stream splitter (FR-19; TRD §14.1)', () => {
  test('keeps the delimiter and block private at every split position', () => {
    const sample = answer + delimiter + '\n' + block + '\n';
    for (let split = 0; split <= sample.length; split++) {
      const splitter = createCitationSplitter();
      let emitted = '';
      for (const delta of [sample.slice(0, split), sample.slice(split)]) {
        emitted += splitter.push(delta);
        expect(answer.startsWith(emitted), `split ${String(split)}`).toBe(true);
      }
      const result = splitter.end();
      expect(emitted + result.flush, `split ${String(split)}`).toBe(answer);
      expect(result).toEqual({ flush: '', answer: answer.trimEnd(), block });
    }
  });

  test('streams safe text immediately and holds every delimiter character', () => {
    const splitter = createCitationSplitter();
    expect(splitter.push(answer)).toBe(answer);
    for (const character of delimiter + '\n' + block) {
      expect(splitter.push(character)).toBe('');
    }
    expect(splitter.end()).toEqual({ flush: '', answer: answer.trimEnd(), block });
  });

  test('streams an answer without a delimiter in order', () => {
    const splitter = createCitationSplitter();
    expect(splitter.push('  PostgreSQL ')).toBe('  PostgreSQL ');
    expect(splitter.push('supports transactions.\n')).toBe('supports transactions.\n');
    expect(splitter.end()).toEqual({
      flush: '',
      answer: '  PostgreSQL supports transactions.',
      block: null,
    });
  });

  test('captures a block when the delimiter is at the very start', () => {
    const splitter = createCitationSplitter();
    expect(splitter.push(delimiter + '\n' + block)).toBe('');
    expect(splitter.end()).toEqual({ flush: '', answer: '', block });
  });

  test('flushes every partial prefix when subsequent text does not complete it', () => {
    for (let length = 1; length < delimiter.length; length++) {
      const splitter = createCitationSplitter();
      const prefix = delimiter.slice(0, length);
      expect(splitter.push(answer + prefix)).toBe(answer);
      expect(splitter.push(' interrupted')).toBe(prefix + ' interrupted');
      expect(splitter.push(delimiter + block)).toBe('');
      expect(splitter.end()).toEqual({
        flush: '',
        answer: answer + prefix + ' interrupted',
        block,
      });
    }
  });

  test('flushes every held-back prefix at end of stream', () => {
    for (let length = 1; length < delimiter.length; length++) {
      const splitter = createCitationSplitter();
      const prefix = delimiter.slice(0, length);
      expect(splitter.push(answer + prefix)).toBe(answer);
      expect(splitter.end()).toEqual({ flush: prefix, answer: answer + prefix, block: null });
    }
  });

  test('captures all trailing content after the first delimiter without parsing it', () => {
    const splitter = createCitationSplitter();
    expect(splitter.push(answer + delimiter + '\n' + block)).toBe(answer);
    expect(splitter.push('\ntrailing content ' + delimiter)).toBe('');
    expect(splitter.push('\n')).toBe('');
    expect(splitter.end()).toEqual({
      flush: '',
      answer: answer.trimEnd(),
      block: block + '\ntrailing content ' + delimiter,
    });
  });

  test('leaves trailing JSON without a delimiter in the answer for server fallback', () => {
    const splitter = createCitationSplitter();
    expect(splitter.push(answer)).toBe(answer);
    expect(splitter.push(block + '\n')).toBe(block + '\n');
    expect(splitter.end()).toEqual({ flush: '', answer: answer + block, block: null });
  });

  test('distinguishes an empty stream from an empty delimited block', () => {
    const empty = createCitationSplitter();
    expect(empty.push('')).toBe('');
    expect(empty.end()).toEqual({ flush: '', answer: '', block: null });
    const delimited = createCitationSplitter();
    expect(delimited.push(delimiter)).toBe('');
    expect(delimited.end()).toEqual({ flush: '', answer: '', block: '' });
  });
});
