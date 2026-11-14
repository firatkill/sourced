// TC-199 / UT-39 / FR-69 / NFR-25: expectations transcribed from original fixtures.
import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import { parseMarkdown } from '@/lib/ingest/parse-markdown';

const fixture = async (name: string) =>
  parseMarkdown(
    await readFile(`tests/fixtures/markdown/${name}`, 'utf8'),
    name,
    name.endsWith('.mdx'),
  );

test.each([
  ['plain.md', 'Field guide'],
  ['single.md', 'A "quoted" guide'],
  ['double.md', "Ada's guide"],
  ['block.md', 'Block fallback'],
  ['toml.md', 'TOML fallback'],
  ['sections.md', 'Garden guide'],
  ['no-heading.md', 'no-heading.md'],
])('UT-39 / D-106: %s title is %s', async (name, title) => {
  const doc = await fixture(name);
  expect(doc.title).toBe(title);
  expect(doc.root.heading).toBe(title);
  expect(JSON.stringify(doc)).not.toContain('Unsupported');
});

test('UT-39 / FR-67: nested sections, siblings and unique GitHub-style slugs', async () => {
  const doc = await fixture('sections.md');
  expect(doc.root.blocks).toEqual([{ kind: 'paragraph', text: 'Intro before headings.' }]);
  expect(doc.root.children.map((s) => [s.heading, s.id, s.level])).toEqual([
    ['Garden guide', 'garden-guide', 1],
    ['Türkçe_başlık', 'türkçe_başlık', 1],
  ]);
  const garden = doc.root.children[0]!;
  expect(garden.blocks).toEqual([{ kind: 'paragraph', text: 'Choose good soil and tools.' }]);
  expect(garden.children.map((s) => [s.heading, s.id, s.level])).toEqual([
    ['Planting, seeds!', 'planting-seeds', 2],
    ['Planting, seeds!', 'planting-seeds-1', 2],
    ['Planting seeds-1', 'planting-seeds-1-1', 2],
  ]);
  expect(garden.children[0]?.children[0]).toEqual({
    id: 'deep-detail',
    heading: 'Deep detail',
    level: 3,
    blocks: [{ kind: 'paragraph', text: 'A deeper paragraph.' }],
    children: [],
  });
});

test('UT-39: code language is metadata, GFM tables/lists and links retain text', async () => {
  const doc = await fixture('blocks.md');
  expect(doc.root.children[0]?.blocks).toEqual([
    { kind: 'code', lang: 'sql', text: "SELECT 'kept';\n  SELECT 2;" },
    { kind: 'code', text: 'no language' },
    { kind: 'table', rows: ['Name | Status', 'Seed | Ready'] },
    { kind: 'list', ordered: false, items: ['Prepare soil', 'Plant seeds'] },
    { kind: 'list', ordered: true, items: ['Water gently', 'Wait'] },
    { kind: 'note', label: '', text: 'Keep the roots moist.' },
    { kind: 'paragraph', text: 'Read the guide and the reference.' },
  ]);
  expect((await fixture('plain.md')).root.children[0]?.blocks).toEqual([
    { kind: 'paragraph', text: 'Opening paragraph with a useful link.' },
  ]);
});

test('UT-39: MDX ESM, attributes and expressions are removed, child text and headings survive', async () => {
  const doc = await fixture('components.mdx');
  expect(doc.title).toBe('Component guide');
  expect(doc.root.children[0]?.blocks).toEqual([
    { kind: 'paragraph', text: 'Child paragraph with strong words.' },
  ]);
  expect(doc.root.children[0]?.children[0]).toEqual({
    heading: 'Nested heading',
    id: 'nested-heading',
    level: 2,
    children: [],
    blocks: [
      { kind: 'paragraph', text: 'A nested paragraph.' },
      { kind: 'paragraph', text: 'Text with visible badge and done.' },
    ],
  });
  expect(JSON.stringify(doc)).not.toMatch(
    /hidden|secret|must never execute|Widget|Panel|Badge|Empty/,
  );
});

test.each([
  'title: >\n  folded',
  'title: {name: value}',
  'title: [one, two]',
  'nested:\n  title: nested',
  'title: plain\n  continuation',
  'title: "unclosed',
  'title: "bad\\q"',
  "title: ''",
  'title: # empty',
])('UT-39 / D-106: unsupported scalar falls back: %s', (matter) => {
  expect(parseMarkdown(`---\n${matter}\n---\n# Fallback\n\nText`, 'fallback.md').title).toBe(
    'Fallback',
  );
});

test('UT-39 / D-106: absent usable title and h1 falls back to file name', () => {
  expect(
    parseMarkdown('---\ntitle: |\n  ignored\n---\n## Lower heading\n\nText', 'file.md').title,
  ).toBe('file.md');
  expect(parseMarkdown('', 'empty.md').root.blocks).toEqual([]);
});

test('UT-39: MDX without front matter uses its first h1 and never evaluates expressions', () => {
  const doc = parseMarkdown(
    '<Panel>\n\n# Heading\n\nText {danger()} kept.\n\n</Panel>',
    'file.mdx',
    true,
  );
  expect(doc.title).toBe('Heading');
  expect(doc.root.children[0]?.blocks).toEqual([{ kind: 'paragraph', text: 'Text kept.' }]);
});

// D-106 accepts quoted one-line scalars without requiring a YAML dependency.
test('UT-39: quoted title delimiters and escapes are removed', () => {
  expect(parseMarkdown("---\ntitle: 'Ada''s guide'\n---\nText", 'file.md').title).toBe(
    "Ada's guide",
  );
  expect(parseMarkdown('---\ntitle: "Guide" # comment\n---\nText', 'file.md').title).toBe('Guide');
});

test('UT-39: line breaks retain spacing and empty MDX/code contributes no text', () => {
  expect(parseMarkdown('First  \nsecond.', 'file.md').root.blocks).toEqual([
    { kind: 'paragraph', text: 'First second.' },
  ]);
  expect(parseMarkdown('```\n\n```', 'file.md').root.blocks).toEqual([]);
  expect(parseMarkdown('{hidden}\n\n<Empty />', 'file.mdx', true).root.blocks).toEqual([]);
});

test('UT-39 / FR-67: GitHub-style anchors preserve repeated spaces as hyphens', () => {
  const doc = parseMarkdown('# A  B!\n\nText\n\n# A  B!\n\nMore', 'file.md');
  expect(doc.root.children.map((section) => section.id)).toEqual(['a--b', 'a--b-1']);
});
