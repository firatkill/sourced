import { expect, test } from 'vitest';
import { countTokens, decode, encode } from '@/lib/ingest/tokenizer';

test('TC-038: UT-01 cl100k_base known counts and Unicode round trip', () => {
  expect(countTokens('')).toBe(0);
  expect(countTokens('hello world')).toBe(2);
  expect(countTokens('Hello, world!')).toBe(4);
  for (const text of [
    'SELECT * FROM documents;',
    'PostgreSQL © — 日本語',
    'Tabs\tand\nline breaks',
    '',
  ]) {
    expect(decode(encode(text))).toBe(text);
    expect(countTokens(text)).toBe(encode(text).length);
  }
});
