// T-81 / D-144: a chat's automatic title is its first question, cut at a word to 60 characters.
import { expect, test } from 'vitest';
import { chatTitle } from '@/lib/chats/schema';

test('short questions are kept whole, whitespace collapsed', () => {
  expect(chatTitle('  When should I use a partial index?  ')).toBe(
    'When should I use a partial index?',
  );
  expect(chatTitle('Line one\n\nline two')).toBe('Line one line two');
});

test('long questions are cut at a word boundary with an ellipsis', () => {
  const title = chatTitle(
    'What is the notice period if we want to end the Acme contract early, and to whom?',
  );
  expect(title).toBe('What is the notice period if we want to end the Acme…');
  expect(title.length).toBeLessThanOrEqual(60);
});

test('a long word without spaces is cut hard', () => {
  const title = chatTitle('x'.repeat(100));
  expect(title).toBe(`${'x'.repeat(59)}…`);
});
