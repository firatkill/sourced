import { describe, expect, test } from 'vitest';
import { AskRequest } from '@/lib/http/ask-request';
import { QUESTION } from '@/lib/config';
import { SUGGESTED_IDS } from '@/lib/suggested';

describe('TC-081 / UT-18: FR-01 normalized strict ask request', () => {
  test('trims and collapses whitespace before checking the length', () => {
    expect(AskRequest.parse({ question: ' \tHow\n do  indexes work? \r\n' })).toEqual({
      question: 'How do indexes work?',
    });
    expect(
      AskRequest.parse({ question: ` ${'x'.repeat(QUESTION.MAX_CHARS)} ` }).question,
    ).toHaveLength(QUESTION.MAX_CHARS);
  });
  test.each([QUESTION.MIN_CHARS, QUESTION.MAX_CHARS])('accepts boundary %i', (length) => {
    expect(AskRequest.safeParse({ question: 'x'.repeat(length) }).success).toBe(true);
  });
  test.each(['', '  ', 'a', 'ab', 'x'.repeat(QUESTION.MAX_CHARS + 1)])(
    'rejects invalid length %#',
    (question) => {
      expect(AskRequest.safeParse({ question }).success).toBe(false);
    },
  );
  test.each([
    null,
    [],
    'question',
    {},
    { question: 4 },
    { question: 'valid', other: true },
    { question: 'valid', suggestedId: 'unknown' },
  ])('rejects invalid shape %#', (body) => {
    expect(AskRequest.safeParse(body).success).toBe(false);
  });
  test.each(SUGGESTED_IDS)('accepts suggested id %s', (suggestedId) => {
    expect(AskRequest.parse({ question: 'valid', suggestedId })).toEqual({
      question: 'valid',
      suggestedId,
    });
  });
});
