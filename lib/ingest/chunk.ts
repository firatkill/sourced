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
};
type Unit = { text: string; literal: boolean };
const sentences = (text: string) => text.split(/(?<=[.!?])\s+(?=[A-Z0-9("'])/);
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

function unitsFor(block: Block): Unit[] {
  const text = render(block);
  const literal = block.kind === 'code' || block.kind === 'table';
  if (countTokens(text) <= CHUNKING.MAX_TOKENS) return text ? [{ text, literal }] : [];
  const parts = literal ? text.split('\n') : sentences(text);
  const separator = literal ? '\n' : ' ';
  const units: Unit[] = [];
  let current = '';
  for (const part of parts) {
    if (current && countTokens(current + separator + part) > CHUNKING.TARGET_TOKENS) {
      units.push({ text: current, literal });
      current = '';
    }
    if (countTokens(part) > CHUNKING.MAX_TOKENS) {
      units.push(...splitTokens(part).map((piece) => ({ text: piece, literal })));
    } else current = current ? current + separator + part : part;
  }
  if (current) units.push({ text: current, literal });
  return units;
}

function tailOverlap(current: Unit[]): Unit[] {
  if (current.at(-1)?.literal) return [];
  let overlap = '';
  for (const sentence of sentences(join(current)).reverse()) {
    const candidate = overlap ? `${sentence} ${overlap}` : sentence;
    if (countTokens(candidate) > CHUNKING.OVERLAP_TOKENS) break;
    overlap = candidate;
  }
  return overlap ? [{ text: overlap, literal: false }] : [];
}

function splitSection(blocks: Block[]): string[] {
  const pieces: string[] = [];
  let current: Unit[] = [];
  let hasNewText = false;
  const emit = () => {
    if (hasNewText) pieces.push(join(current));
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
    for (const content of splitSection(section.blocks))
      chunks.push({
        ordinal: chunks.length,
        headingPath,
        anchor: `${slug}#${section.id}`,
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
