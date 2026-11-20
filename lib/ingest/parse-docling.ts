import { z } from 'zod';
import { headingSlug } from './parse-html-generic';
import type { Block, ParsedDocument, Section } from './parse-html';

/**
 * D-152 / TRD §45.3: Docling's JSON document (DoclingDocument) turned into the shared section
 * tree, so chunking, citations and page links work as they do for the built-in parsers.
 * Only the fields used here are validated; Docling adds fields between versions.
 */
const Ref = z.object({ $ref: z.string() });
const Prov = z.object({ page_no: z.number().int().positive() });
const Node = z.object({
  self_ref: z.string(),
  children: z.array(Ref).default([]),
  content_layer: z.string().default('body'),
  label: z.string(),
  prov: z.array(Prov).default([]),
});
const TextItem = Node.extend({
  text: z.string().default(''),
  level: z.number().int().optional(),
  enumerated: z.boolean().optional(),
});
const GroupItem = Node.extend({ name: z.string().optional() });
const TableCell = z.object({ text: z.string().default('') });
const TableItem = Node.extend({
  captions: z.array(Ref).default([]),
  data: z.object({ grid: z.array(z.array(TableCell)).default([]) }),
});
const PictureItem = Node.extend({ captions: z.array(Ref).default([]) });
export const DoclingDocument = z.object({
  schema_name: z.literal('DoclingDocument'),
  name: z.string().default(''),
  body: Node.extend({ label: z.string().default('unspecified') }),
  groups: z.array(GroupItem).default([]),
  texts: z.array(TextItem).default([]),
  tables: z.array(TableItem).default([]),
  pictures: z.array(PictureItem).default([]),
});
export type DoclingDocument = z.infer<typeof DoclingDocument>;
type Text = z.infer<typeof TextItem>;

/** Running page headers and footers, not the document's own content. */
const FURNITURE = new Set(['page_header', 'page_footer']);
const clean = (value: string) => value.replace(/\s+/g, ' ').trim();

/**
 * `paged` keeps page numbers on blocks (PDF only): they become "Open at page N" links. Slides
 * and Word files have no pages a viewer can jump to, so a slide becomes a "Slide N" heading.
 */
export function doclingToSections(
  input: unknown,
  options: { fileName: string; paged: boolean; slides?: boolean },
): ParsedDocument {
  const doc = DoclingDocument.parse(input);
  const lookup = (ref: string) => {
    const match = /^#\/(texts|groups|tables|pictures)\/(\d+)$/.exec(ref);
    if (!match) return undefined;
    const index = Number(match[2]);
    switch (match[1]) {
      case 'texts':
        return { kind: 'text' as const, item: doc.texts[index] };
      case 'groups':
        return { kind: 'group' as const, item: doc.groups[index] };
      case 'tables':
        return { kind: 'table' as const, item: doc.tables[index] };
      default:
        return { kind: 'picture' as const, item: doc.pictures[index] };
    }
  };
  const textOf = (ref: { $ref: string }) => {
    const found = lookup(ref.$ref);
    return found?.kind === 'text' && found.item ? clean(found.item.text) : '';
  };
  const pagesOf = (prov: { page_no: number }[]) =>
    options.paged ? [...new Set(prov.map((entry) => entry.page_no))] : [];

  const title =
    clean(
      doc.texts.find((text) => text.label === 'title' && text.content_layer === 'body')?.text ?? '',
    ) ||
    clean(
      doc.texts.find((text) => text.label === 'section_header' && text.content_layer === 'body')
        ?.text ?? '',
    ) ||
    options.fileName;
  const hasTitle = doc.texts.some(
    (text) => text.label === 'title' && text.content_layer === 'body',
  );
  const root: Section = { id: '', level: 0, heading: title, blocks: [], children: [] };
  const starts = new Map<Section, number>();
  const stack: Section[] = [root];
  let current = root;
  let titleUsed = false;

  const open = (heading: string, level: number, page: number | undefined) => {
    while (stack.length > 1 && current.level >= level) {
      stack.pop();
      current = stack.at(-1) ?? root;
    }
    const section: Section = {
      id: options.paged ? '' : headingSlug(heading),
      level,
      heading,
      blocks: [],
      children: [],
    };
    if (page !== undefined) starts.set(section, page);
    current.children.push(section);
    stack.push(section);
    current = section;
  };
  const push = (block: Block, prov: { page_no: number }[]) => {
    const pages = pagesOf(prov);
    current.blocks.push(pages.length ? { ...block, pages } : block);
  };
  const listItems = (refs: { $ref: string }[], depth = 0): string[] =>
    refs.flatMap((ref) => {
      const found = lookup(ref.$ref);
      if (!found?.item || found.item.content_layer !== 'body') return [];
      if (found.kind === 'text') {
        const text = clean(found.item.text);
        const nested = listItems(found.item.children, depth + 1);
        return [...(text ? [`${'  '.repeat(depth)}${text}`] : []), ...nested];
      }
      if (found.kind === 'group') return listItems(found.item.children, depth + 1);
      return [];
    });
  const listProv = (refs: { $ref: string }[]): { page_no: number }[] =>
    refs.flatMap((ref) => {
      const found = lookup(ref.$ref);
      if (!found?.item) return [];
      return [...found.item.prov, ...listProv(found.item.children)];
    });

  const visitText = (text: Text) => {
    const value = clean(text.text);
    if (FURNITURE.has(text.label)) return;
    const page = options.paged ? text.prov[0]?.page_no : undefined;
    if (value)
      switch (text.label) {
        case 'title':
          // The first title names the document; later ones (or every slide title) are headings.
          if (!titleUsed && !options.slides) titleUsed = true;
          else open(value, 1, page);
          break;
        case 'section_header':
          if (!titleUsed && !hasTitle && value === title) titleUsed = true;
          else open(value, Math.min(6, Math.max(1, text.level ?? 1) + (hasTitle ? 1 : 0)), page);
          break;
        case 'code':
          push({ kind: 'code', text: text.text.trimEnd() }, text.prov);
          break;
        case 'list_item':
          push({ kind: 'list', items: [value], ordered: Boolean(text.enumerated) }, text.prov);
          break;
        default:
          push({ kind: 'paragraph', text: value }, text.prov);
      }
    // Word headings hold the paragraphs that follow them as children.
    for (const child of text.children) visit(child);
  };

  const visit = (ref: { $ref: string }) => {
    const found = lookup(ref.$ref);
    if (!found?.item || found.item.content_layer !== 'body') return;
    switch (found.kind) {
      case 'text':
        visitText(found.item);
        return;
      case 'group': {
        const group = found.item;
        if (group.label === 'list' || group.label === 'ordered_list') {
          const items = listItems(group.children);
          const first = lookup(group.children[0]?.$ref ?? '');
          const ordered =
            group.label === 'ordered_list' ||
            (first?.kind === 'text' && Boolean(first.item?.enumerated));
          if (items.length) push({ kind: 'list', items, ordered }, listProv(group.children));
          return;
        }
        if (options.slides && group.label === 'chapter') {
          const slide = Number(/(\d+)$/.exec(group.name ?? '')?.[1] ?? '0') + 1;
          const titleRef = group.children.find((child) => {
            const item = lookup(child.$ref);
            return item?.kind === 'text' && item.item?.label === 'title';
          });
          const slideTitle = titleRef ? textOf(titleRef) : '';
          open(
            slideTitle ? `Slide ${String(slide)}: ${slideTitle}` : `Slide ${String(slide)}`,
            1,
            undefined,
          );
          for (const child of group.children) if (child !== titleRef) visit(child);
          return;
        }
        for (const child of group.children) visit(child);
        return;
      }
      case 'table': {
        const table = found.item;
        for (const caption of table.captions) {
          const text = textOf(caption);
          if (text) push({ kind: 'paragraph', text }, table.prov);
        }
        const rows = table.data.grid
          .map((row) => {
            // A merged cell repeats in every column it spans; keep it once.
            const cells = row
              .map((cell) => clean(cell.text))
              .filter((cell, index, all) => index === 0 || cell !== all[index - 1]);
            return cells.some(Boolean) ? cells.join(' | ') : '';
          })
          .filter(Boolean);
        if (rows.length) push({ kind: 'table', rows }, table.prov);
        return;
      }
      case 'picture': {
        // Images are not read; their captions are text and stay searchable.
        for (const caption of found.item.captions) {
          const text = textOf(caption);
          if (text) push({ kind: 'paragraph', text }, found.item.prov);
        }
        return;
      }
    }
  };
  for (const child of doc.body.children) visit(child);
  mergeLists(root);

  if (options.paged) {
    const anchor = (section: Section): number[] => {
      const start = starts.get(section);
      const pages = [
        ...(start !== undefined ? [start] : []),
        ...section.blocks.flatMap((block) => block.pages ?? []),
        ...section.children.flatMap(anchor),
      ];
      if (pages.length) {
        const from = Math.min(...pages);
        const to = Math.max(...pages);
        section.id = from === to ? `p${String(from)}` : `p${String(from)}-${String(to)}`;
      }
      return pages;
    };
    anchor(root);
  }
  return { title, root };
}

/** Consecutive single list items (list items outside a list group) become one list. */
function mergeLists(section: Section): void {
  const merged: Block[] = [];
  for (const block of section.blocks) {
    const previous = merged.at(-1);
    if (
      block.kind === 'list' &&
      previous?.kind === 'list' &&
      previous.ordered === block.ordered &&
      block.items.length === 1
    ) {
      previous.items.push(...block.items);
      const pages = [...new Set([...(previous.pages ?? []), ...(block.pages ?? [])])];
      if (pages.length) previous.pages = pages;
    } else merged.push(block.kind === 'list' ? { ...block, items: [...block.items] } : block);
  }
  section.blocks = merged;
  for (const child of section.children) mergeLists(child);
}
