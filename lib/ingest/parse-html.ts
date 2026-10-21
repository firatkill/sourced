import { load } from 'cheerio';
import { createLogger } from '@/lib/logger';
import { AppError } from '@/lib/errors';
import type { Manifest, ManifestPage } from './manifest';

export type Block =
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: string[]; ordered: boolean }
  | { kind: 'code'; text: string }
  | { kind: 'table'; rows: string[] }
  | { kind: 'note'; label: string; text: string };
export type Section = {
  id: string;
  level: number;
  heading: string;
  blocks: Block[];
  children: Section[];
};
export type ParsedDocument = { title: string; root: Section };
type ParsePage = ManifestPage & Pick<Manifest, 'contentSelector' | 'removeSelectors'>;

// Verified in indexes-partial, transaction-iso and datatype-json: ids are on section divs.
// SQL reference entries use unclassed headings; D-57 authorizes a same-section fallback.
const sectionSelector =
  'div.chapter,div.sect1,div.sect2,div.sect3,div.sect4,div.refsect1,div.refentry';
const noteSelector = 'div.note,div.tip,div.warning,div.caution,div.important';
const clean = (text: string) => text.replace(/\s+/g, ' ').trim();

export function parseHtml(html: string, page: ParsePage): ParsedDocument {
  const $ = load(html);
  let container = $(page.contentSelector);
  if (!container.length) {
    createLogger().warn(
      { slug: page.slug },
      'Corpus content selector missing; falling back to body',
    );
    container = $('body');
  }
  for (const selector of page.removeSelectors) container.find(selector).remove();
  const rootElement = container.find(sectionSelector).first();
  if (!rootElement.length)
    throw new AppError('VALIDATION_FAILED', 'Corpus page has no documentation section.');
  type Node = (typeof rootElement)[number];
  const headingFor = (element: Node) => {
    const headings = $(element)
      .find('h1,h2,h3,h4,h5')
      .filter(
        (_, node) =>
          $(node).closest(sectionSelector).get(0) === element &&
          $(node).closest(noteSelector).length === 0,
      );
    return clean(
      (headings.filter('.title').first().length
        ? headings.filter('.title').first()
        : headings.first()
      ).text(),
    );
  };
  const build = (element: Node, parentId: string, parentLevel: number): Section => {
    const node = $(element);
    const classes = node.attr('class') ?? '';
    const match = /\bsect([1-4])\b/.exec(classes);
    const level = match?.[1] ? Number(match[1]) : parentLevel + 1;
    const section: Section = {
      id: node.attr('id') ?? parentId,
      level,
      heading: headingFor(element),
      blocks: [],
      children: [],
    };
    const push = (block: Block) => {
      section.blocks.push(block);
    };
    const visit = (child: Node) => {
      const item = $(child);
      if (item.is(sectionSelector)) {
        section.children.push(build(child, section.id, level));
        return;
      }
      if (item.is('h1,h2,h3,h4,h5,h6')) return;
      if (item.is(noteSelector)) {
        const copy = item.clone();
        const label = clean(copy.find('.title').first().text());
        copy.find('.title').remove();
        const text = clean(copy.text());
        if (text) push({ kind: 'note', label, text });
        return;
      }
      if (item.is('pre')) {
        const text = item.text().trimEnd();
        if (text.trim()) push({ kind: 'code', text });
        return;
      }
      if (item.is('ul,ol')) {
        const items = item
          .children('li')
          .map((_, li) => clean($(li).text()))
          .get()
          .filter(Boolean);
        if (items.length) push({ kind: 'list', items, ordered: item.is('ol') });
        return;
      }
      if (item.is('table')) {
        const rows = item
          .find('tr')
          .map((_, row) =>
            $(row)
              .children('th,td')
              .map((_, cell) => clean($(cell).text()))
              .get()
              .join(' | '),
          )
          .get()
          .filter(Boolean);
        if (rows.length) push({ kind: 'table', rows });
        return;
      }
      if (item.is('dl')) {
        for (const term of item.children('dt').toArray()) {
          const definition = $(term)
            .nextUntil('dt', 'dd')
            .map((_, dd) => clean($(dd).text()))
            .get()
            .join(' ');
          const text = `${clean($(term).text())}: ${definition}`;
          if (clean($(term).text()) || definition) push({ kind: 'paragraph', text });
        }
        return;
      }
      if (item.is('p')) {
        const text = clean(item.text());
        if (text) push({ kind: 'paragraph', text });
        return;
      }
      for (const descendant of item.children().toArray()) visit(descendant);
    };
    for (const child of node.children().toArray()) visit(child);
    return section;
  };
  const root = rootElement.get(0);
  if (!root) throw new AppError('VALIDATION_FAILED', 'Corpus page has no documentation section.');
  const section = build(root, '', 0);
  return { title: section.heading, root: section };
}
