// TC-200 / UT-40 / FR-70: every chunk's range covers its actual content, including overlap.
import { expect, test } from 'vitest';
import { chunkDocument } from '@/lib/ingest/chunk';
import type { ParsedDocument } from '@/lib/ingest/parse-html';

const doc = (blocks: ParsedDocument['root']['blocks']): ParsedDocument => ({
  title: 'PDF',
  root: { id: 'p1-3', level: 0, heading: 'PDF', blocks, children: [] },
});

test('UT-40: tiny sections merge their page ranges and anchors', () => {
  const document = doc([]);
  document.root.children = [1, 2, 3].map((page) => ({
    id: `p${String(page)}`,
    level: 1,
    heading: `Section ${String(page)}`,
    children: [],
    blocks: [{ kind: 'paragraph', text: `Text on page ${String(page)}.`, pages: [page] }],
  }));
  expect(chunkDocument(document, 'manual.pdf')).toEqual([
    expect.objectContaining({
      pageFrom: 1,
      pageTo: 3,
      anchor: 'manual.pdf#p1-3',
      content: 'Text on page 1.\n\nText on page 2.\n\nText on page 3.',
    }),
  ]);
});

test('UT-40: splitting long blocks and carrying overlap preserves page provenance', () => {
  const chunks = chunkDocument(
    doc(
      [1, 2, 3].map((page) => ({
        kind: 'paragraph',
        pages: [page],
        text: `Page${String(page)} sentence about the garden. `.repeat(160).trim(),
      })),
    ),
    'manual.pdf',
  );
  expect(chunks.length).toBeGreaterThan(3);
  for (const chunk of chunks) {
    const pages = [...chunk.content.matchAll(/Page(\d)/g)].map((match) => Number(match[1]));
    const from = Math.min(...pages);
    const to = Math.max(...pages);
    expect(chunk).toMatchObject({
      pageFrom: from,
      pageTo: to,
      anchor: `manual.pdf#p${String(from)}${to === from ? '' : `-${String(to)}`}`,
    });
  }
});

test('UT-40: oversized unbroken text still retains its page', () => {
  const chunks = chunkDocument(
    doc([{ kind: 'paragraph', text: 'word '.repeat(2000), pages: [4] }]),
    'manual.pdf',
  );
  expect(chunks.length).toBeGreaterThan(1);
  expect(
    chunks.every(
      (chunk) => chunk.pageFrom === 4 && chunk.pageTo === 4 && chunk.anchor === 'manual.pdf#p4',
    ),
  ).toBe(true);
});
