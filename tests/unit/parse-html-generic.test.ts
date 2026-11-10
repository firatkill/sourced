import { readFile } from 'node:fs/promises';
import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import { expect, test, vi } from 'vitest';
import { parseHtml, type ParsePage, type Section } from '@/lib/ingest/parse-html';
import { buildHtmlSections } from '@/lib/ingest/parse-html-generic';

const warn = vi.hoisted(() => vi.fn());
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ warn }) }));
const page: ParsePage = {
  slug: 'test.html',
  section: 'test',
  html: { contentSelector: '', removeSelectors: [] },
};
// UT-38 / FR-68: transcribed from the saved HTML before running the parser.
const fixtures = [
  {
    name: 'python',
    title: '8. Errors and Exceptions — Python 3.15.2 documentation',
    headings: ['8. Errors and Exceptions¶'],
    expected: ['syntax errors and exceptions', 'Errors detected during execution'],
    forbidden: ['Report a bug', 'Show source', 'Previous topic'],
  },
  {
    name: 'kubernetes',
    title: 'Overview | Kubernetes',
    headings: ['Overview'],
    expected: ['The name Kubernetes originates from Greek', 'Kubernetes provides you with'],
    forbidden: ['Buy your ticket now!', 'Kubernetes Blog', 'Linux Foundation'],
  },
  {
    name: 'mdn',
    title: '<blockquote> HTML block quotation element - HTML | MDNMDNMDNMozilla',
    headings: ['<blockquote> HTML block quotation element'],
    expected: [
      'indicates that the enclosed text is an extended quotation',
      'attribution for the quotation',
    ],
    forbidden: ['MDN on GitHub', 'Visit Mozilla Corporation', 'HTML cheatsheet'],
  },
  {
    name: 'rust',
    title: 'Variables and Mutability - The Rust Programming Language',
    headings: ['Variables and Mutability'],
    expected: ['variables are immutable', 'Declaring Constants', 'Shadowing'],
    forbidden: ['Keyboard shortcuts', 'Change theme', 'Print this book'],
  },
  {
    name: 'django',
    title: 'Django shortcut functions | Django documentation | Django',
    headings: ['Django shortcut functions¶'],
    expected: ['introduce controlled coupling', 'HttpResponse'],
    forbidden: ['Support Django!', 'Getting help', 'Django Hosting'],
  },
];
const allText = (section: Section): string =>
  [
    section.heading,
    ...section.blocks.map((b) =>
      b.kind === 'list' ? b.items.join(' ') : b.kind === 'table' ? b.rows.join(' ') : b.text,
    ),
    ...section.children.map(allText),
  ].join(' ');

test.each(fixtures)(
  'UT-38 / A-20 / NFR-25: $name fixture works with Readability on linkedom',
  async ({ name, title, headings, expected, forbidden }) => {
    const html = await readFile(`tests/fixtures/sites/${name}.html`, 'utf8');
    const result = new Readability(parseHTML(html).document).parse();
    expect(result?.textContent?.length).toBeGreaterThanOrEqual(200);
    const doc = parseHtml(html, page);
    expect(doc.title).toBe(title);
    expect(doc.root.children.map((s) => s.heading)).toEqual(headings);
    for (const text of expected) expect(allText(doc.root)).toContain(text);
    for (const text of forbidden) expect(allText(doc.root)).not.toContain(text);
  },
);

test('UT-38 / TRD §33.2: sections, enclosing ids, slug fallback and every block kind', () => {
  const doc = buildHtmlSections(
    `<p>Intro <code>inline</code>.</p><div id="outer"><h1>One</h1><p>First</p><h3 id="deep">Deep</h3><pre>  code\nline  </pre><h2>Sibling</h2><ul><li>A</li><li>B</li></ul><ol><li>C</li></ol><table><tr><th>K</th><th>V</th></tr><tr><td>a</td><td>b</td></tr></table><blockquote>Quote</blockquote><div class="note">Note</div><div class="warning">Warning</div><div class="tip">Tip</div><div class="admonition">Admonition</div><div class="callout">Callout</div></div><h1>Hello, World!</h1><code>standalone</code><h6>Last</h6>`,
    'Page',
  );
  expect(doc.root.blocks).toEqual([{ kind: 'paragraph', text: 'Intro inline.' }]);
  expect(doc.root.children.map((s) => [s.heading, s.id, s.level])).toEqual([
    ['One', 'outer', 1],
    ['Hello, World!', 'hello-world', 1],
  ]);
  expect(doc.root.children[0]?.children.map((s) => [s.heading, s.id, s.level])).toEqual([
    ['Deep', 'deep', 3],
    ['Sibling', 'outer', 2],
  ]);
  expect(doc.root.children[0]?.children[0]?.blocks).toEqual([
    { kind: 'code', text: '  code\nline' },
  ]);
  expect(doc.root.children[0]?.children[1]?.blocks).toEqual([
    { kind: 'list', items: ['A', 'B'], ordered: false },
    { kind: 'list', items: ['C'], ordered: true },
    { kind: 'table', rows: ['K | V', 'a | b'] },
    ...['Quote', 'Note', 'Warning', 'Tip', 'Admonition', 'Callout'].map((text) => ({
      kind: 'note',
      label: '',
      text,
    })),
  ]);
  expect(doc.root.children[1]?.blocks).toEqual([{ kind: 'code', text: 'standalone' }]);
  expect(doc.root.children[1]?.children[0]?.level).toBe(6);
});

test('UT-38 / FR-68: explicit selectors, removal and warned body fallback', () => {
  const html =
    '<title>Page</title><nav><p>Navigation</p></nav><main><p>Chosen</p><p class="remove">Removed</p></main><article><p>Other</p></article>';
  const doc = parseHtml(html, {
    ...page,
    html: { contentSelector: 'main', removeSelectors: ['.remove'] },
  });
  expect(doc.root.blocks).toEqual([{ kind: 'paragraph', text: 'Chosen' }]);
  const fallback = parseHtml(html, {
    ...page,
    html: { contentSelector: '.missing', removeSelectors: ['nav', '.remove', 'article'] },
  });
  expect(fallback.root.blocks).toEqual(doc.root.blocks);
  expect(warn).toHaveBeenCalledWith(
    { slug: page.slug },
    'Corpus content selector missing; falling back to body',
  );
});

test.each(['main', 'article', 'div role="main"', 'div id="content"', 'div class="content"'])(
  'UT-38: short Readability result falls back to largest %s',
  (tag) => {
    const name = tag.split(' ')[0] ?? 'div';
    const doc = parseHtml(
      `<title>Small</title><main><p>Tiny</p></main><${tag}><nav><p>Noise</p></nav><p>The larger content.</p></${name}>`,
      page,
    );
    expect(doc.root.blocks).toEqual([{ kind: 'paragraph', text: 'The larger content.' }]);
  },
);

test('UT-38: body fallback removes boilerplate and keeps short text', () => {
  const doc = parseHtml(
    '<title>Short</title><nav><p>Nav</p></nav><header><p>Header</p></header><footer><p>Footer</p></footer><aside><p>Aside</p></aside><div role="navigation"><p>Menu</p></div><script>script</script><style>style</style><noscript><p>noscript</p></noscript><form><p>form</p></form><p>Kept.</p>',
    page,
  );
  expect(doc.root.blocks).toEqual([{ kind: 'paragraph', text: 'Kept.' }]);
});

test('UT-38: empty blocks remain empty for ingestion to report and skip', () => {
  const doc = buildHtmlSections(
    '<h1></h1><p> </p><pre> </pre><code></code><ul><li> </li></ul><ol></ol><table><tr></tr><tr><td> </td><td></td></tr></table><blockquote> </blockquote>',
    '',
  );
  expect(doc.root.blocks).toEqual([]);
  expect(doc.root.children[0]?.blocks).toEqual([]);
  expect(parseHtml('', page).root.blocks).toEqual([]);
});

test('UT-38 / D-103: page chrome is removed by role, element and case-insensitive names', () => {
  const attrs = [
    'class="Article-FOOTER"',
    'id="left-SIDEBAR"',
    'class="Breadcrumbs"',
    'id="help-popup"',
    'class="other TOC"',
    'hidden',
    'aria-hidden="true"',
    'role="banner"',
    'role="contentinfo"',
    'role="complementary"',
    'role="dialog"',
  ];
  const html = `<title>Page</title><dialog><p>Dialog noise</p></dialog>${attrs.map((attr) => `<div ${attr}><p>Chrome noise</p></div>`).join('')}<main><h1>Article</h1><p>Kept text.</p><div class="stock"><p>Not a toc class.</p></div></main>`;
  const doc = parseHtml(html, page);
  expect(allText(doc.root)).not.toContain('noise');
  expect(allText(doc.root)).toContain('Kept text.');
  expect(allText(doc.root)).toContain('Not a toc class.');
});

test('UT-38 / D-103 / TRD §33.1: restored h1 retains its nearest enclosing source anchor', () => {
  const doc = parseHtml(
    `<title>Article</title><main><section id="source-anchor"><h1>Article</h1><p>${'Useful documentation about a feature, with details for readers. '.repeat(12)}</p></section></main>`,
    page,
  );
  expect(doc.root.children.map((section) => [section.heading, section.id])).toEqual([
    ['Article', 'source-anchor'],
  ]);
});

test('UT-38 / D-105: chrome class matching preserves document roots and main-content ancestors', () => {
  const doc = parseHtml(
    '<html class="sidebar-visible"><body class="with-footer"><div class="sidebar-layout"><main><h1>Article</h1><p>Preserved content.</p></main></div><div class="sidebar"><p>Sidebar noise.</p></div></body></html>',
    page,
  );
  expect(doc.root.children.map((section) => section.heading)).toEqual(['Article']);
  expect(allText(doc.root)).toContain('Preserved content.');
  expect(allText(doc.root)).not.toContain('Sidebar noise.');
});

test('UT-38 / D-105: a toolbar h1 outside the main region is not restored', () => {
  const doc = parseHtml(
    `<title>Book</title><div><h1>Book</h1></div><main><h2>Chapter</h2><p>${'Useful chapter documentation with detailed explanations. '.repeat(15)}</p></main>`,
    page,
  );
  expect(doc.root.children.map((section) => section.heading)).toEqual(['Chapter']);
});

test('UT-38 / TRD §33.1: Readability-generated wrapper ids never become citation anchors', () => {
  const doc = parseHtml(
    `<title>Article</title><main><h1>Article</h1><p>${'Useful documentation about a feature. '.repeat(15)}</p><h2>Details</h2><p>${'Further information about this feature. '.repeat(15)}</p></main>`,
    page,
  );
  expect(doc.root.children[0]?.id).toBe('article');
  expect(doc.root.children[0]?.children[0]?.id).toBe('details');
});
