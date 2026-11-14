// TC-200 / UT-40 / FR-70, NFR-25. Expectations from generate.ts's page contents.
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from 'vitest';
import type { Section } from '@/lib/ingest/parse-html';
import { extractPdf, parsePdf } from '@/lib/ingest/parse-pdf';
import { makePdf, generateFixtures } from '../fixtures/pdf/generate';

const fixture = async (name: string) => extractPdf(await readFile(`tests/fixtures/pdf/${name}`));

test('UT-40: page-local extraction detects title and both larger-font headings', async () => {
  const result = await fixture('headings.pdf');
  expect(result.status).toBe('ok');
  if (result.status !== 'ok') throw new Error('Expected text PDF');
  expect(
    result.pages.map((page) => page.filter((line) => line.heading).map((line) => line.text)),
  ).toEqual([['Garden handbook', 'Planting seeds'], ['Caring for seedlings']]);
  expect(result.pages.map((page) => page.length)).toEqual([6, 6]);
  expect(result.pages[1]?.[0]).toMatchObject({
    text: 'Keep the seed tray warm until shoots appear.',
    page: 2,
    heading: false,
  });
});

test('UT-40: uniform text has no detected heading', async () => {
  const result = await fixture('pages.pdf');
  expect(result.status).toBe('ok');
  if (result.status !== 'ok') throw new Error('Expected text PDF');
  expect(result.pages.map((page) => page.map((line) => line.heading))).toEqual([
    [false, false],
    [false, false],
  ]);
});

test('UT-40: image-only pages need OCR', async () => {
  expect(await fixture('scanned.pdf')).toEqual({ status: 'needs_ocr' });
});

test('UT-40: OCR threshold is strictly under 20 characters per page on average', async () => {
  expect((await extractPdf(makePdf([[{ text: 'a'.repeat(39), size: 12 }], []]))).status).toBe(
    'needs_ocr',
  );
  expect((await extractPdf(makePdf([[{ text: 'a'.repeat(40), size: 12 }], []]))).status).toBe('ok');
});

test('UT-40: heading length must be under 120 and font threshold includes exactly 1.25x', async () => {
  const result = await extractPdf(
    makePdf(
      [
        [
          { text: 'H'.repeat(120), size: 18 },
          { text: 'At threshold', size: 15 },
          { text: 'Below threshold', size: 14 },
          ...Array.from({ length: 5 }, () => ({
            text: 'Ordinary body text on the page.',
            size: 12,
          })),
        ],
      ],
      false,
      3000,
    ),
  );
  if (result.status !== 'ok') throw new Error('Expected text PDF');
  expect(result.pages[0]?.filter((line) => line.heading).map((line) => line.text)).toEqual([
    'At threshold',
  ]);
});

test('UT-40: raw PDF generator reproduces all four committed fixtures byte for byte', async () => {
  const names = ['headings.pdf', 'pages.pdf', 'scanned.pdf', 'info-title.pdf'];
  const before = await Promise.all(names.map((name) => readFile(`tests/fixtures/pdf/${name}`)));
  const directory = await mkdtemp(join(tmpdir(), 'sourced-pdf-'));
  try {
    await generateFixtures(pathToFileURL(`${directory}/`));
    expect(await Promise.all(names.map((name) => readFile(join(directory, name))))).toEqual(before);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

const parsed = async (name: string) => {
  const result = await parsePdf(await readFile(`tests/fixtures/pdf/${name}`), name);
  if (result.status !== 'ok') throw new Error('Expected parsed PDF');
  return result.document;
};

test('UT-40 / D-107: Info Title takes precedence over the first-page heading', async () => {
  const doc = await parsed('info-title.pdf');
  expect(doc.title).toBe('Garden metadata title');
  expect(doc.root.children[0]).toMatchObject({
    heading: 'Visible garden heading',
    level: 1,
    id: 'p1',
  });
});

test('UT-40 / FR-67 / D-107: heading sections span pages, nest by ranked sizes and retain page-local blocks', async () => {
  const doc = await parsed('headings.pdf');
  expect(doc.title).toBe('Garden handbook');
  const handbook = doc.root.children[0]!;
  expect(handbook).toMatchObject({ heading: 'Garden handbook', level: 1, id: 'p1-2' });
  expect(handbook.blocks).toEqual([
    { kind: 'paragraph', text: 'A practical handbook for a small garden.', pages: [1] },
  ]);
  expect(handbook.children.map((section) => [section.heading, section.level, section.id])).toEqual([
    ['Planting seeds', 3, 'p1-2'],
    ['Caring for seedlings', 2, 'p2'],
  ]);
  expect(handbook.children[0]?.blocks).toEqual([
    { kind: 'paragraph', text: 'Choose a sunny place for the seed tray.', pages: [1] },
    { kind: 'paragraph', text: 'Fill the tray with soil and water gently.', pages: [1] },
    { kind: 'paragraph', text: 'Leave enough space between each seed.', pages: [1] },
    { kind: 'paragraph', text: 'Keep the seed tray warm until shoots appear.', pages: [2] },
    { kind: 'paragraph', text: 'Check the soil each morning before watering.', pages: [2] },
  ]);
  expect(handbook.children[1]?.blocks.map((block) => block.pages)).toEqual([[2], [2], [2]]);
});

test('UT-40: no heading yields one section per page and the file-name title', async () => {
  const doc = await parsed('pages.pdf');
  expect(doc.title).toBe('pages.pdf');
  expect(
    doc.root.children.map((section) => [section.id, section.blocks.map((block) => block.pages)]),
  ).toEqual([
    ['p1', [[1], [1]]],
    ['p2', [[2], [2]]],
  ]);
});

test('UT-40 / D-107: heading sizes round to half points and levels cap at six', async () => {
  const sizes = [30, 29.8, 28, 26, 24, 22, 20, 18];
  const result = await parsePdf(
    makePdf(
      sizes.map((size, index) => [
        { text: `Heading ${String(index + 1)}`, size },
        { text: 'Body paragraph establishes the page median.', size: 12 },
        { text: 'Another paragraph on the same page.', size: 12 },
      ]),
    ),
    'levels.pdf',
  );
  if (result.status !== 'ok') throw new Error('Expected parsed PDF');
  const visit = (section: Section): Section[] => [section, ...section.children.flatMap(visit)];
  expect(
    visit(result.document.root)
      .slice(1)
      .map((section) => section.level),
  ).toEqual([1, 1, 2, 3, 4, 5, 6, 6]);
});

test.each(['', '   '])(
  'UT-40 / D-107: empty Info Title %j falls back to the first-page heading',
  async (title) => {
    const result = await parsePdf(
      makePdf(
        [
          [
            { text: 'Fallback heading', size: 24 },
            { text: 'First body paragraph establishes the median.', size: 12 },
            { text: 'Another body paragraph.', size: 12 },
          ],
        ],
        false,
        612,
        title,
      ),
      'fallback.pdf',
    );
    expect(result).toMatchObject({ status: 'ok', document: { title: 'Fallback heading' } });
  },
);

test('UT-40 / D-107: headings after page one do not supply the title; pre-heading text stays in the root', async () => {
  const result = await parsePdf(
    makePdf([
      [{ text: 'Opening page without a heading.', size: 12 }],
      [
        { text: 'Later heading', size: 24 },
        { text: 'First body paragraph establishes the median.', size: 12 },
        { text: 'Another body paragraph.', size: 12 },
      ],
    ]),
    'later.pdf',
  );
  expect(result).toMatchObject({
    status: 'ok',
    document: {
      title: 'later.pdf',
      root: {
        blocks: [{ kind: 'paragraph', text: 'Opening page without a heading.', pages: [1] }],
        children: [{ heading: 'Later heading', id: 'p2' }],
      },
    },
  });
});

test('UT-40: section parser reports scanned PDF as needs_ocr', async () => {
  expect(await parsePdf(await readFile('tests/fixtures/pdf/scanned.pdf'), 'scanned.pdf')).toEqual({
    status: 'needs_ocr',
  });
});
