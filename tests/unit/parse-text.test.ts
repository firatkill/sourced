// TRD §33.1 / IT-17: source line positions survive chunk splitting and overlap.
import { expect, test } from 'vitest';
import { parseText } from '@/lib/ingest/parse-text';
import { chunkDocument } from '@/lib/ingest/chunk';

test('plain text uses one filename section and paragraph start lines', () => {
  const parsed = parseText(
    '\r\nFirst paragraph.\r\nSecond line.\r\n\r\nNext paragraph.',
    'guide.txt',
  );
  expect(parsed.title).toBe('guide.txt');
  expect(parsed.root.children).toEqual([]);
  expect(parsed.root.blocks).toEqual([
    { kind: 'paragraph', text: 'First paragraph.\nSecond line.', lineFrom: 2 },
    { kind: 'paragraph', text: 'Next paragraph.', lineFrom: 5 },
  ]);
  expect(chunkDocument(parsed, 'guide.txt')[0]?.anchor).toBe('guide.txt#l2');
});
test('long plain text anchors track each chunk start including overlap', () => {
  const lines = Array.from(
    { length: 100 },
    (_, i) =>
      `Line ${String(i + 1)} has a distinctive sentence about growing seedlings with enough water and light.`,
  );
  const chunks = chunkDocument(parseText(lines.join('\n\n'), 'guide.txt'), 'guide.txt');
  expect(chunks.length).toBeGreaterThan(1);
  for (const chunk of chunks) {
    const first = Number(chunk.content.match(/^Line (\d+)/)?.[1]);
    expect(chunk.anchor).toBe(`guide.txt#l${String(first * 2 - 1)}`);
  }
});

test('long paragraphs split at sentences without losing original line offsets', () => {
  const lines = Array.from(
    { length: 100 },
    (_, i) =>
      `Line ${String(i + 1)} has a distinctive sentence about growing seedlings with enough water and light.`,
  );
  const chunks = chunkDocument(parseText(lines.join('\n'), 'guide.txt'), 'guide.txt');
  expect(chunks.length).toBeGreaterThan(1);
  for (const chunk of chunks) {
    const first = Number(chunk.content.match(/^Line (\d+)/)?.[1]);
    expect(chunk.anchor).toBe(`guide.txt#l${String(first)}`);
  }
});
