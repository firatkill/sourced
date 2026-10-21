import { expect, test } from 'vitest';
import { CHUNKING } from '@/lib/config';
import { chunkDocument } from '@/lib/ingest/chunk';
import type { Block, ParsedDocument, Section } from '@/lib/ingest/parse-html';
import { countTokens } from '@/lib/ingest/tokenizer';

const paragraph = (text: string): Block => ({ kind: 'paragraph', text });
const section = (id: string, blocks: Block[], children: Section[] = []): Section => ({
  id,
  heading: id,
  level: 1,
  blocks,
  children,
});
const doc = (blocks: Block[], children: Section[] = []): ParsedDocument => ({
  title: 'Document',
  root: section('ROOT', blocks, children),
});
const words = (count: number) => 'word '.repeat(count).trim();
const chunksFor = (input: ParsedDocument) => {
  const chunks = chunkDocument(input, 'test.html');
  expect(chunkDocument(input, 'test.html')).toEqual(chunks);
  for (const [index, chunk] of chunks.entries()) {
    expect(chunk.ordinal).toBe(index);
    expect(chunk.tokenCount).toBe(countTokens(chunk.content));
    expect(chunk.tokenCount).toBeGreaterThan(0);
    expect(chunk.tokenCount).toBeLessThanOrEqual(CHUNKING.MAX_TOKENS);
  }
  return chunks;
};

test('TC-039: UT-03 counts separators and overlap against the hard bound (D-58)', () => {
  expect(countTokens(words(400))).toBe(400);
  expect(countTokens(`${words(400)}\n\n${words(400)}`)).toBe(801);
  expect(chunksFor(doc([paragraph(words(400)), paragraph(words(400))]))).toHaveLength(2);
  const input = doc([paragraph(`${words(630)}. Short sentence.`), paragraph(words(799))]);
  expect(chunksFor(input).map((chunk) => chunk.content)).toEqual([
    `${words(630)}. Short sentence.`,
    words(799),
  ]);
});

test('TC-039: UT-03 preorder headings, section isolation and forward tiny merge', () => {
  const input = doc(
    [paragraph('Tiny introduction.')],
    [
      section('CHILD', [paragraph(words(60))], [section('NESTED', [paragraph(words(50))])]),
      section('LAST', [paragraph('Final tiny section.')]),
    ],
  );
  const chunks = chunksFor(input);
  expect(chunks).toHaveLength(3);
  expect(chunks[0]).toMatchObject({
    anchor: 'test.html#CHILD',
    headingPath: ['Document', 'CHILD'],
    content: `Tiny introduction.\n\n${words(60)}`,
  });
  expect(chunks[1]?.headingPath).toEqual(['Document', 'CHILD', 'NESTED']);
  expect(chunks[2]?.anchor).toBe('test.html#LAST');
  expect(
    chunksFor(doc([paragraph(words(39))], [section('FULL', [paragraph(words(799))])])),
  ).toHaveLength(2);
  expect(chunksFor(doc([]))).toEqual([]);
});

test('TC-039: UT-03 block rendering and whole-sentence overlap', () => {
  const rendered = chunksFor(
    doc([
      { kind: 'list', ordered: false, items: ['one', 'two'] },
      { kind: 'list', ordered: true, items: ['first', 'second'] },
      { kind: 'code', text: 'SELECT 1;\nSELECT 2;' },
      { kind: 'table', rows: ['A | B', '1 | 2'] },
      { kind: 'note', label: 'Note', text: 'Remember.' },
    ]),
  );
  expect(rendered[0]?.content).toBe(
    '- one\n- two\n\n1. first\n2. second\n\n\n\nSELECT 1;\nSELECT 2;\n\n\n\nA | B\n1 | 2\n\nNote: Remember.',
  );
  const text = `${words(650)}. Short ending.`;
  const chunks = chunksFor(doc([paragraph(text), paragraph(words(100))]));
  expect(chunks[0]?.content).toBe(text);
  expect(chunks[1]?.content).toBe(`Short ending.\n\n${words(100)}`);
  expect(chunksFor(doc([paragraph(text)]))).toHaveLength(1);
});

test('TC-039: UT-03 oversized sentences and Unicode retain all non-whitespace text', () => {
  for (const text of [
    words(2100),
    '日本語🦊'.repeat(400),
    Array.from({ length: 500 }, (_, i) => `Sentence ${String(i)}.`).join(' '),
  ]) {
    const chunks = chunksFor(doc([paragraph(text)]));
    // Unique sentence blocks fit together below the target; remove only exact overlap prefixes.
    let reconstructed = '';
    for (const chunk of chunks) {
      const compact = chunk.content.replace(/\s/g, '');
      let overlap = 0;
      for (let i = 1; i <= compact.length && i <= reconstructed.length; i++) {
        if (reconstructed.endsWith(compact.slice(0, i))) overlap = i;
      }
      // Repeated words / Unicode are original content, not sentence overlap.
      reconstructed += compact.slice(text.startsWith('Sentence') ? overlap : 0);
    }
    expect(reconstructed).toBe(text.replace(/\s/g, ''));
  }
});

test('TC-039: UT-03 code/table split at lines without overlap, long lines are bounded', () => {
  const lines = Array.from({ length: 500 }, (_, i) => `SELECT ${String(i)};`);
  for (const block of [
    { kind: 'code' as const, text: lines.join('\n') },
    { kind: 'table' as const, rows: lines },
    { kind: 'code' as const, text: words(1800) },
  ]) {
    const chunks = chunksFor(doc([block]));
    const source = block.kind === 'table' ? block.rows.join('') : block.text;
    expect(
      chunks
        .map((chunk) => chunk.content)
        .join('')
        .replace(/\s/g, ''),
    ).toBe(source.replace(/\s/g, ''));
  }
  const code = words(650);
  expect(
    chunksFor(doc([{ kind: 'code', text: code }, paragraph('Next section text.')]))[1]?.content,
  ).toBe('Next section text.');
});
