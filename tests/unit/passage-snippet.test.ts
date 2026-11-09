import { expect, test } from 'vitest';
import { RETRIEVAL } from '@/lib/config';
import { passageSnippet } from '@/lib/retrieval/pipeline';

test('TRD §9.5: snippet preserves short and exactly-sized content', () => {
  expect(passageSnippet('PostgreSQL indexes')).toBe('PostgreSQL indexes');
  expect(passageSnippet('a'.repeat(RETRIEVAL.SNIPPET_CHARS))).toHaveLength(RETRIEVAL.SNIPPET_CHARS);
  expect(passageSnippet('')).toBe('');
});

test('TRD §9.5: truncated snippets end at a whole word and append an ellipsis', () => {
  const words = 'word '.repeat(60);
  expect(passageSnippet(words)).toBe('word '.repeat(48).trimEnd() + '…');
  const boundary = 'a'.repeat(RETRIEVAL.SNIPPET_CHARS);
  expect(passageSnippet(boundary + ' next')).toBe(boundary + '…');
  expect(passageSnippet('prefix ' + 'a'.repeat(RETRIEVAL.SNIPPET_CHARS))).toBe('prefix…');
  expect(passageSnippet('a'.repeat(RETRIEVAL.SNIPPET_CHARS + 1))).toBe('…');
});
