import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import { load } from 'cheerio';
import { createLogger } from '@/lib/logger';
import type { Block, ParsedDocument, ParsePage, Section } from './parse-html';

const clean = (text: string) => text.replace(/\s+/g, ' ').trim();
const boilerplate = 'nav,header,footer,aside,[role=navigation],script,style,noscript,form';
const notes = 'blockquote,.note,.warning,.tip,.admonition,.callout';
const headingSlug = (heading: string) =>
  heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');

/** TRD §33.2: main-content detection followed by the shared HTML section builder. */
export function parseHtmlGeneric(html: string, page: ParsePage): ParsedDocument {
  const $ = load(html);
  const title = clean($('title').text());
  let container: ReturnType<typeof $> = $('body');
  if (page.html.contentSelector) {
    container = $(page.html.contentSelector);
    if (!container.length) {
      createLogger().warn(
        { slug: page.slug },
        'Corpus content selector missing; falling back to body',
      );
      container = $('body');
    }
  } else {
    $(
      'nav,header,footer,aside,dialog,[hidden],[aria-hidden="true"],[role=navigation],[role=banner],[role=contentinfo],[role=complementary],[role=dialog]',
    ).remove();
    $('[class],[id]')
      .filter((_, element) => {
        const node = $(element);
        if (node.is('html,body') || node.find('main,article,[role=main]').length) return false;
        return (
          /footer|sidebar|breadcrumb|popup/i.test(
            `${node.attr('class') ?? ''} ${node.attr('id') ?? ''}`,
          ) || (node.attr('class') ?? '').split(/\s+/).some((name) => name.toLowerCase() === 'toc')
        );
      })
      .remove();
    // Capture source anchors before Readability replaces wrappers or creates ids.
    $('h1,h2,h3,h4,h5,h6').each((_, element) => {
      const heading = $(element);
      heading.attr('id', heading.closest('[id]').attr('id') ?? headingSlug(clean(heading.text())));
    });
    const regions = $('main,article,[role=main]');
    const sourceHeading = regions.find('h1').first();
    const firstHeading = sourceHeading.clone();
    const { document } = parseHTML($.html());
    // Let Readability try its less aggressive passes before choosing the longest
    // result: documentation introductions can live in containers named 'header'.
    const article = new Readability(document, {
      keepClasses: true,
      ...(regions.length
        ? {
            charThreshold: Math.max(
              ...regions.map((_, region) => clean($(region).text()).length).get(),
            ),
          }
        : {}),
    }).parse();
    if (article && clean(article.textContent ?? '').length >= 200) {
      container = load(article.content ?? '')('body');
      if (!container.find('h1').length && firstHeading.length) container.prepend(firstHeading);
    } else {
      const candidates = $('main,article,[role=main],#content,.content').toArray();
      candidates.sort((a, b) => $(b).text().length - $(a).text().length);
      const largest = candidates[0];
      if (largest) container = $(largest);
    }
    container.find(boilerplate).remove();
  }
  for (const selector of page.html.removeSelectors) container.find(selector).remove();
  return buildHtmlSections(container.toString(), title);
}

/** Steps 4–5 also serve converted document formats without content detection. */
export function buildHtmlSections(html: string, title: string): ParsedDocument {
  const $ = load(html);
  const root: Section = { id: '', level: 0, heading: title, blocks: [], children: [] };
  const stack = [root];
  let current = root;
  const body = $('body');
  type Node = (typeof body)[number];
  const push = (block: Block) => current.blocks.push(block);
  const visit = (element: Node) => {
    const node = $(element);
    if (node.is('h1,h2,h3,h4,h5,h6')) {
      const heading = clean(node.text());
      const level = Number(element.name.slice(1));
      while (stack.length > 1 && current.level >= level) {
        stack.pop();
        current = stack.at(-1) ?? root;
      }
      const section: Section = {
        id: node.closest('[id]').attr('id') ?? headingSlug(heading),
        level,
        heading,
        blocks: [],
        children: [],
      };
      current.children.push(section);
      stack.push(section);
      current = section;
      return;
    }
    if (node.is(notes)) {
      const text = clean(node.text());
      if (text) push({ kind: 'note', label: '', text });
      return;
    }
    if (node.is('pre,code')) {
      const text = node.text().trimEnd();
      if (text.trim()) push({ kind: 'code', text });
      return;
    }
    if (node.is('ul,ol')) {
      const items = node
        .children('li')
        .map((_, li) => clean($(li).text()))
        .get()
        .filter(Boolean);
      if (items.length) push({ kind: 'list', items, ordered: node.is('ol') });
      return;
    }
    if (node.is('table')) {
      const rows = node
        .find('tr')
        .map((_, row) => {
          const cells = $(row)
            .children('th,td')
            .map((_, cell) => clean($(cell).text()))
            .get();
          return cells.some(Boolean) ? cells.join(' | ') : '';
        })
        .get()
        .filter(Boolean);
      if (rows.length) push({ kind: 'table', rows });
      return;
    }
    if (node.is('p')) {
      const text = clean(node.text());
      if (text) push({ kind: 'paragraph', text });
      return;
    }
    for (const child of node.children().toArray()) visit(child);
  };
  for (const child of body.children().toArray()) visit(child);
  return { title, root };
}
