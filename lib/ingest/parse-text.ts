import type { Block, ParsedDocument } from './parse-html';

/** TRD §33.1: retain original line positions through paragraph packing. */
export function parseText(text: string, fileName: string): ParsedDocument {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let start = 0;
  for (let index = 0; index <= lines.length; index++) {
    if (index < lines.length && lines[index]?.trim()) continue;
    if (index > start)
      blocks.push({
        kind: 'paragraph',
        text: lines.slice(start, index).join('\n'),
        lineFrom: start + 1,
      });
    start = index + 1;
  }
  return { title: fileName, root: { id: 'l1', level: 1, heading: fileName, blocks, children: [] } };
}
