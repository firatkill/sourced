// T-80 / REDESIGN-v2 §3.3: library facts replace the corpus title.
import { expect, test } from 'vitest';
import {
  documentCount,
  libraryPill,
  searchingLine,
  updatedAgo,
  type LibraryFacts,
} from '@/lib/library/format';

const now = new Date('2026-11-20T12:00:00Z');
const facts = (overrides: Partial<LibraryFacts> = {}): LibraryFacts => ({
  documents: 128,
  sources: ['contracts/', 'handbook/', 'specs/'],
  lastIngestAt: '2026-11-20T10:00:00Z',
  ...overrides,
});

test('documentCount uses the singular for one document', () => {
  expect(documentCount(0)).toBe('0 documents');
  expect(documentCount(1)).toBe('1 document');
  expect(documentCount(128)).toBe('128 documents');
});

test('updatedAgo rounds down to the largest whole unit', () => {
  expect(updatedAgo('2026-11-20T11:59:30Z', now)).toBe('just now');
  expect(updatedAgo('2026-11-20T12:05:00Z', now)).toBe('just now'); // clock skew
  expect(updatedAgo('2026-11-20T11:55:00Z', now)).toBe('5 min ago');
  expect(updatedAgo('2026-11-20T10:00:00Z', now)).toBe('2 h ago');
  expect(updatedAgo('2026-11-19T11:00:00Z', now)).toBe('1 day ago');
  expect(updatedAgo('2026-11-17T12:00:00Z', now)).toBe('3 days ago');
});

test('libraryPill shows the count and freshness, or the empty state', () => {
  expect(libraryPill(facts(), now)).toBe('128 documents · updated 2 h ago');
  expect(libraryPill(facts({ documents: 0 }), now)).toBe('No documents indexed yet');
  expect(libraryPill(facts({ lastIngestAt: null }), now)).toBe('No documents indexed yet');
});

test('searchingLine lists up to three sources, then a count', () => {
  expect(searchingLine(facts())).toBe('Searching contracts/, handbook/ and specs/');
  expect(searchingLine(facts({ sources: ['docs/'] }))).toBe('Searching docs/');
  expect(searchingLine(facts({ sources: ['a/', 'example.com'] }))).toBe(
    'Searching a/ and example.com',
  );
  expect(searchingLine(facts({ sources: ['a/', 'b/', 'c/', 'd/', 'e/'] }))).toBe(
    'Searching a/, b/, c/ and 2 more',
  );
  expect(searchingLine(facts({ sources: [] }))).toBeNull();
});
