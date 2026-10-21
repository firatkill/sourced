import { createHash } from 'node:crypto';
import { expect, test } from 'vitest';
import { chunkContentHash } from '@/lib/ingest/chunk';

test('TC-040: UT-04 content identity includes slug, anchor and content but not ordinal', () => {
  const chunk = { anchor: 'a.html#ONE', content: 'Same paragraph.', ordinal: 0 };
  const hash = chunkContentHash('a.html', chunk);
  expect(hash).toBe(
    createHash('sha256').update('a.html\na.html#ONE\nSame paragraph.').digest('hex'),
  );
  const moved = { ...chunk, ordinal: 9 };
  expect(chunkContentHash('a.html', moved)).toBe(hash);
  expect(chunkContentHash('b.html', chunk)).not.toBe(hash);
  expect(chunkContentHash('a.html', { ...chunk, anchor: 'a.html#TWO' })).not.toBe(hash);
  expect(chunkContentHash('a.html', { ...chunk, content: 'Changed.' })).not.toBe(hash);
});
