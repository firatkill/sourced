import { CHUNKING } from '@/lib/config';
import { sha256Hex } from '@/lib/hash';
import type { Block, ParsedDocument, Section } from './parse-html';
import { countTokens } from './tokenizer';

export type Chunk = {
  ordinal: number;
  headingPath: string[];
  anchor: string;
  content: string;
  tokenCount: number;
  lineFrom?: number;
  pageFrom?: number;
  pageTo?: number;
};
type Unit = {
  text: string;
  literal: boolean;
  pages?: number[];
  lineFrom?: number;
  offset?: number;
};
export const sentences = (text: string) => text.split(/(?<=[.!?])\s+(?=[A-Z0-9("'])/);
const join = (units: Unit[]) => units.map((unit) => unit.text).join('\n\n');

function render(block: Block): string {
  switch (block.kind) {
    case 'paragraph':
      return block.text;
    case 'list':
      return block.items
        .map((item, index) => `${block.ordered ? `${String(index + 1)}.` : '-'} ${item}`)
        .join('\n');
    case 'code':
      return `\n\n${block.text}\n\n`;
    case 'table':
      return block.rows.join('\n');
    case 'note':
      return `Note: ${block.text}`;
    default: {
      const exhaustive: never = block;
      return exhaustive;
    }
  }
}

// Preserve Unicode code points when a tokenizer boundary falls inside UTF-8 bytes.
function splitTokens(text: string): string[] {
  const result: string[] = [];
  let rest = Array.from(text);
  while (countTokens(rest.join('')) > CHUNKING.MAX_TOKENS) {
    let low = 1;
    let high = rest.length;
    let end = 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (countTokens(rest.slice(0, middle).join('')) <= CHUNKING.TARGET_TOKENS) {
        end = middle;
        low = middle + 1;
      } else high = middle - 1;
    }
    result.push(rest.slice(0, end).join(''));
    rest = rest.slice(end);
  }
  if (rest.length) result.push(rest.join(''));
  return result;
}

function textUnitsFor(block: Block): Unit[] {
  const text = render(block);
  const literal = block.kind === 'code' || block.kind === 'table';
  if (countTokens(text) <= CHUNKING.MAX_TOKENS) return text ? [{ text, literal }] : [];
  const parts = literal ? text.split('\n') : sentences(text);
  const defaultSeparator = literal ? '\n' : ' ';
  const units: Unit[] = [];
  let current = '';
  let currentOffset = 0;
  let sourceCursor = 0;
  for (const part of parts) {
    const partOffset = text.indexOf(part, sourceCursor);
    const separator =
      block.lineFrom !== undefined ? text.slice(sourceCursor, partOffset) : defaultSeparator;
    sourceCursor = partOffset + part.length;
    if (current && countTokens(current + separator + part) > CHUNKING.TARGET_TOKENS) {
      units.push({ text: current, literal, offset: currentOffset });
      current = '';
    }
    if (countTokens(part) > CHUNKING.MAX_TOKENS) {
      let offset = partOffset;
      units.push(
        ...splitTokens(part).map((piece) => {
          const unit = { text: piece, literal, offset };
          offset += piece.length;
          return unit;
        }),
      );
    } else {
      if (!current) currentOffset = partOffset;
      current = current ? current + separator + part : part;
    }
  }
  if (current) units.push({ text: current, literal, offset: currentOffset });
  return units;
}

function unitsFor(block: Block): Unit[] {
  let cursor = 0;
  return textUnitsFor(block).map((unit) => {
    const text = render(block);
    const offset = text.indexOf(unit.text, cursor);
    const start = unit.offset ?? (offset < 0 ? cursor : offset);
    cursor = start + unit.text.length;
    return {
      ...unit,
      ...(block.pages ? { pages: block.pages } : {}),
      ...(block.lineFrom !== undefined
        ? { lineFrom: block.lineFrom + text.slice(0, start).split('\n').length - 1 }
        : {}),
    };
  });
}

function tailOverlap(current: Unit[]): Unit[] {
  if (current.at(-1)?.literal) return [];
  const full = join(current);
  let cursor = 0;
  const parts = sentences(full).map((text) => {
    const start = full.indexOf(text, cursor);
    cursor = start + text.length;
    return { text, start };
  });
  let overlap = '';
  let start = full.length;
  for (const sentence of parts.reverse()) {
    const candidate = overlap ? `${sentence.text} ${overlap}` : sentence.text;
    if (countTokens(candidate) > CHUNKING.OVERLAP_TOKENS) break;
    overlap = candidate;
    start = sentence.start;
  }
  cursor = 0;
  let lineFrom: number | undefined;
  const pages = current.flatMap((unit) => {
    const end = cursor + unit.text.length;
    if (lineFrom === undefined && end > start && unit.lineFrom !== undefined)
      lineFrom =
        unit.lineFrom + unit.text.slice(0, Math.max(0, start - cursor)).split('\n').length - 1;
    cursor = end + 2;
    return end > start ? (unit.pages ?? []) : [];
  });
  return overlap
    ? [
        {
          text: lineFrom !== undefined ? full.slice(start) : overlap,
          literal: false,
          ...(lineFrom !== undefined ? { lineFrom } : {}),
          ...(pages.length ? { pages } : {}),
        },
      ]
    : [];
}

function pageRange(pages: number[]): { pageFrom?: number; pageTo?: number } {
  return pages.length ? { pageFrom: Math.min(...pages), pageTo: Math.max(...pages) } : {};
}
const pageAnchor = (from: number, to: number) =>
  from === to ? `p${String(from)}` : `p${String(from)}-${String(to)}`;

function splitSection(
  blocks: Block[],
): { content: string; lineFrom?: number; pageFrom?: number; pageTo?: number }[] {
  const pieces: { content: string; lineFrom?: number; pageFrom?: number; pageTo?: number }[] = [];
  let current: Unit[] = [];
  let hasNewText = false;
  const emit = () => {
    if (hasNewText)
      pieces.push({
        content: join(current),
        ...(current[0]?.lineFrom !== undefined ? { lineFrom: current[0].lineFrom } : {}),
        ...pageRange(current.flatMap((unit) => unit.pages ?? [])),
      });
  };
  for (const unit of blocks.flatMap(unitsFor)) {
    if (countTokens(join([...current, unit])) > CHUNKING.MAX_TOKENS) {
      emit();
      current = countTokens(join(current)) >= CHUNKING.MIN_TOKENS ? tailOverlap(current) : [];
      hasNewText = false;
      if (countTokens(join([...current, unit])) > CHUNKING.MAX_TOKENS) current = [];
    }
    current.push(unit);
    hasNewText = true;
    if (countTokens(join(current)) >= CHUNKING.TARGET_TOKENS) {
      emit();
      current = tailOverlap(current);
      hasNewText = false;
    }
  }
  emit();
  return pieces;
}

export function chunkDocument(doc: ParsedDocument, slug: string): Chunk[] {
  const chunks: Chunk[] = [];
  const visit = (section: Section, headingPath: string[]) => {
    for (const { content, ...range } of splitSection(section.blocks))
      chunks.push({
        ordinal: chunks.length,
        headingPath,
        anchor: `${slug}#${range.pageFrom !== undefined && range.pageTo !== undefined ? pageAnchor(range.pageFrom, range.pageTo) : range.lineFrom !== undefined ? `l${String(range.lineFrom)}` : section.id}`,
        ...range,
        content,
        tokenCount: countTokens(content),
      });
    for (const child of section.children) visit(child, [...headingPath, child.heading]);
  };
  visit(doc.root, [doc.title]);
  for (let index = 0; index < chunks.length - 1;) {
    const chunk = chunks[index];
    const next = chunks[index + 1];
    if (!chunk || !next) break;
    const content = `${chunk.content}\n\n${next.content}`;
    const tokenCount = countTokens(content);
    if (chunk.tokenCount < CHUNKING.TINY_SECTION_TOKENS && tokenCount <= CHUNKING.MAX_TOKENS) {
      if (
        chunk.pageFrom !== undefined &&
        next.pageFrom !== undefined &&
        next.pageTo !== undefined &&
        chunk.pageTo !== undefined
      ) {
        next.pageFrom = Math.min(chunk.pageFrom, next.pageFrom);
        next.pageTo = Math.max(chunk.pageTo, next.pageTo);
        next.anchor = `${slug}#${pageAnchor(next.pageFrom, next.pageTo)}`;
      }
      if (chunk.lineFrom !== undefined) {
        next.lineFrom = chunk.lineFrom;
        next.anchor = `${slug}#l${String(chunk.lineFrom)}`;
      }
      next.content = content;
      next.tokenCount = tokenCount;
      chunks.splice(index, 1);
    } else index++;
  }
  return chunks.map((chunk, ordinal) => ({ ...chunk, ordinal }));
}

export function chunkContentHash(slug: string, chunk: Pick<Chunk, 'anchor' | 'content'>): string {
  return sha256Hex(`${slug}\n${chunk.anchor}\n${chunk.content}`);
}
