// T-100 / D-152: Docling's JSON output becomes the shared section tree; checked against
// Docling's own ground-truth outputs (tests/fixtures/docling/README.md).
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { chunkDocument } from '@/lib/ingest/chunk';
import { doclingToSections } from '@/lib/ingest/parse-docling';
import type { Section } from '@/lib/ingest/parse-html';

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(`tests/fixtures/docling/${name}`, 'utf8'));
const headings = (section: Section): string[] => [
  section.heading,
  ...section.children.flatMap(headings),
];

describe('T-100: Docling JSON to sections', () => {
  test('a PDF keeps page numbers on blocks and page anchors on sections', () => {
    const document = doclingToSections(fixture('multi_page.pdf.json'), {
      fileName: 'history.pdf',
      paged: true,
    });
    expect(document.title).toBe('The Evolution of the Word Processor');
    // The first header names the document and is not repeated as a section.
    expect(document.root.children[0]?.heading).toBe('Pre-Digital Era (19th - Early 20th Century)');
    expect(document.root.children.map((section) => section.id)).toContain('p1-2');
    const chunks = chunkDocument(document, 'history.pdf');
    expect(chunks.length).toBeGreaterThan(5);
    expect(chunks.every((chunk) => chunk.pageFrom !== undefined)).toBe(true);
    expect(chunks.at(-1)?.pageTo).toBe(5);
    expect(chunks.map((chunk) => chunk.content).join('\n')).toContain('IBM MT/ST');
  });

  test('a Word file nests sections under its headings and has no pages', () => {
    const document = doclingToSections(fixture('word_sample.docx.json'), {
      fileName: 'lake.docx',
      paged: false,
    });
    expect(document.title).toBe('Swimming in the lake');
    expect(headings(document.root)).toEqual(['Swimming in the lake', 'Let’s swim!', 'Let’s eat']);
    const swim = document.root.children[0];
    expect(swim?.id).toBe('lets-swim');
    expect(swim?.blocks.some((block) => block.kind === 'list')).toBe(true);
    const table = swim?.children[0]?.blocks.find((block) => block.kind === 'table');
    expect(table).toMatchObject({ kind: 'table' });
    expect(table && 'rows' in table ? table.rows[1] : '').toBe('Leaves | Ash, Elm, Maple | 50');
    const chunks = chunkDocument(document, 'lake.docx');
    expect(chunks.every((chunk) => chunk.pageFrom === undefined)).toBe(true);
  });

  test('slides become "Slide N" sections without page links', () => {
    const document = doclingToSections(fixture('powerpoint_sample.pptx.json'), {
      fileName: 'deck.pptx',
      paged: false,
      slides: true,
    });
    expect(document.root.children.map((section) => section.heading)).toEqual([
      'Slide 1: Test Table Slide',
      'Slide 2: Second slide title',
      'Slide 3',
    ]);
    const lists = document.root.children[2]?.blocks.filter((block) => block.kind === 'list');
    expect(lists?.length).toBeGreaterThan(0);
    // A merged header cell appears once, not once per column it spans.
    const table = document.root.children[0]?.blocks.find((block) => block.kind === 'table');
    expect(table && 'rows' in table ? table.rows[0] : '').toBe(' | Class1 | Class2');
    expect(chunkDocument(document, 'deck.pptx').every((c) => c.pageFrom === undefined)).toBe(true);
  });

  test('running headers and footers are left out', () => {
    const document = doclingToSections(
      {
        schema_name: 'DoclingDocument',
        body: { self_ref: '#/body', children: [{ $ref: '#/texts/0' }, { $ref: '#/texts/1' }] },
        texts: [
          { self_ref: '#/texts/0', label: 'page_header', text: 'ACME confidential', prov: [] },
          { self_ref: '#/texts/1', label: 'text', text: 'Body text.', prov: [{ page_no: 2 }] },
        ],
      },
      { fileName: 'scan.pdf', paged: true },
    );
    expect(document.title).toBe('scan.pdf');
    expect(document.root.blocks).toEqual([{ kind: 'paragraph', text: 'Body text.', pages: [2] }]);
  });

  test('anything but a DoclingDocument is refused', () => {
    expect(() =>
      doclingToSections({ schema_name: 'Other' }, { fileName: 'x', paged: false }),
    ).toThrow();
  });
});
