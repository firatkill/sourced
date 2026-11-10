// UT-41 / A-26 / FR-67, FR-70, NFR-25. Expected content comes from generate.ts.
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from 'vitest';
import mammoth from 'mammoth';
import { openArrayBuffer } from 'mammoth/lib/zipfile';
import { parseDocx } from '@/lib/ingest/parse-docx';
import { makeDocx, paragraph, generateFixtures } from '../fixtures/docx/generate';

const fixture = async (name: string) =>
  parseDocx(await readFile(`tests/fixtures/docx/${name}`), name);

test('UT-41: an empty core-properties part falls back to the file name', async () => {
  const archive = await openArrayBuffer(await makeDocx(paragraph('Body text.')));
  archive.write(
    'docProps/core.xml',
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"/>',
  );
  const parsed = await parseDocx(new Uint8Array(await archive.toArrayBuffer()), 'empty-core.docx');
  expect(parsed.document.title).toBe('empty-core.docx');
});

test('UT-41: dc:title takes precedence and XML entities are decoded', async () => {
  const result = await fixture('properties.docx');
  expect(result.warnings).toBe(0);
  expect(result.document.title).toBe('Garden & field handbook');
  expect(result.document.root.children[0]).toMatchObject({
    heading: 'Visible heading',
    id: 'visible-heading',
  });
});

test('UT-41 / A-26: Word Heading 1–3 styles become nested sections with heading slugs', async () => {
  const { document, warnings } = await fixture('headings.docx');
  expect(warnings).toBe(0);
  expect(document.title).toBe('Garden handbook');
  expect(document.root.blocks).toEqual([
    { kind: 'paragraph', text: 'Opening paragraph stays in the root.' },
  ]);
  expect(document.root.children).toEqual([
    {
      heading: 'Garden handbook',
      level: 1,
      id: 'garden-handbook',
      blocks: [{ kind: 'paragraph', text: 'Garden introduction.' }],
      children: [
        {
          heading: 'Planting seeds',
          level: 2,
          id: 'planting-seeds',
          blocks: [{ kind: 'paragraph', text: 'Prepare the soil.' }],
          children: [
            {
              heading: 'Seed depth',
              level: 3,
              id: 'seed-depth',
              blocks: [{ kind: 'paragraph', text: 'Sow shallowly.' }],
              children: [],
            },
          ],
        },
        {
          heading: 'Watering plants',
          level: 2,
          id: 'watering-plants',
          blocks: [{ kind: 'paragraph', text: 'Water in the morning.' }],
          children: [],
        },
      ],
    },
  ]);
});

test('UT-41: no headings uses the filename and keeps paragraphs in the root', async () => {
  expect(await fixture('plain.docx')).toEqual({
    warnings: 0,
    document: {
      title: 'plain.docx',
      root: {
        heading: 'plain.docx',
        level: 0,
        id: '',
        children: [],
        blocks: [{ kind: 'paragraph', text: 'This handbook has no headings.' }],
      },
    },
  });
});

test.each([undefined, '', '   '])(
  'UT-41: missing or blank properties %j fall back to the first heading even without H1',
  async (title) => {
    const { document } = await parseDocx(
      await makeDocx(paragraph('First H2', 'Heading2') + paragraph('Body text.'), title),
      'fallback.docx',
    );
    expect(document.title).toBe('First H2');
  },
);

test('UT-41 / A-26: nested numbered and bulleted lists, header table and embedded image', async () => {
  const bytes = await readFile('tests/fixtures/docx/lists-table-image.docx');
  // Verify the fixture exercises a real image and actual nested lists/header cells.
  const html = (await mammoth.convertToHtml({ buffer: bytes })).value;
  expect(html).toContain(
    '<ol><li>Prepare soil <ol><li>Loosen earth</li></ol></li><li>Plant seeds</li></ol>',
  );
  expect(html).toContain(
    '<ul><li>Tools <ul><li>Small trowel</li></ul></li><li>Watering can</li></ul>',
  );
  expect(html).toContain('<th><p>Plant</p></th>');
  expect(html).toContain('<img');
  const { document, warnings } = await parseDocx(bytes, 'lists-table-image.docx');
  expect(warnings).toBe(0);
  expect(document.root.children[0]?.blocks).toEqual([
    { kind: 'list', ordered: true, items: ['Prepare soil Loosen earth', 'Plant seeds'] },
    { kind: 'list', ordered: false, items: ['Tools Small trowel', 'Watering can'] },
    { kind: 'table', rows: ['Plant | Water', 'Basil | Daily'] },
    { kind: 'paragraph', text: 'Text after the table and before the image.' },
  ]);
  expect(JSON.stringify(document)).not.toContain('Ignored image description');
  expect(JSON.stringify(document)).not.toContain('data:image');
});

test('UT-41: Mammoth warnings are counted while unknown-style text is retained', async () => {
  expect(await fixture('warning.docx')).toMatchObject({
    warnings: 1,
    document: {
      root: { blocks: [{ kind: 'paragraph', text: 'An unfamiliar style keeps its text.' }] },
    },
  });
});

test('UT-41: fixture generator reproduces all semantic parser results', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sourced-docx-'));
  try {
    await generateFixtures(pathToFileURL(`${directory}/`));
    for (const name of [
      'properties.docx',
      'headings.docx',
      'plain.docx',
      'lists-table-image.docx',
      'warning.docx',
    ]) {
      expect(await parseDocx(await readFile(join(directory, name)), name)).toEqual(
        await fixture(name),
      );
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
