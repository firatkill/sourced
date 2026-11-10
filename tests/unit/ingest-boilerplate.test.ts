// FR-71 / UT-42
import { expect, test } from 'vitest';
import { removeBoilerplate } from '@/lib/ingest/boilerplate';
import { parseText } from '@/lib/ingest/parse-text';

const documents = (count: number, repeat: number, sourceId = 'docs') =>
  Array.from({ length: count }, (_, i) => ({
    sourceId,
    document: parseText(
      `${i < repeat ? 'Shared footer!' : `Unique ${String(i)}`}\n\nDocument ${String(i)}`,
      `${String(i)}.txt`,
    ),
  }));
test.each([
  [9, 9, 0],
  [10, 4, 0],
  [10, 5, 5],
  [20, 5, 0],
  [20, 6, 6],
  [21, 6, 0],
  [21, 7, 7],
])('UT-42: %i documents / %i repeated => %i removed', (count, repeat, removed) => {
  expect(removeBoilerplate(documents(count, repeat))).toEqual({ docs: removed });
});
test('UT-42: normalizes blocks, counts distinct documents and isolates sources', () => {
  const docs = documents(10, 4);
  docs[0]!.document.root.blocks.push({ kind: 'paragraph', text: 'SHARED FOOTER.' });
  expect(removeBoilerplate(docs)).toEqual({ docs: 0 });
  docs[4]!.document.root.children.push({
    id: 'child',
    level: 2,
    heading: 'Child',
    children: [],
    blocks: [{ kind: 'paragraph', text: 'SHARED   FOOTER.' }],
  });
  expect(removeBoilerplate([...docs, ...documents(10, 4, 'other')])).toEqual({ docs: 6, other: 0 });
});
