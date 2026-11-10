// TC-200 / UT-40 / A-21: actual unpdf, no mocked extraction and no native modules.
import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import { extractTextItems, getDocumentProxy } from 'unpdf';

test('A-21: unpdf returns page-local text with font sizes without a canvas', async () => {
  const pdf = await getDocumentProxy(
    new Uint8Array(await readFile('tests/fixtures/pdf/headings.pdf')),
  );
  try {
    const { totalPages, items } = await extractTextItems(pdf);
    expect(totalPages).toBe(2);
    expect(items[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ str: 'Garden handbook', fontSize: 24 }),
        expect.objectContaining({ str: 'Planting seeds', fontSize: 15 }),
        expect.objectContaining({ str: 'Choose a sunny place for the seed tray.', fontSize: 12 }),
      ]),
    );
    expect(items[1]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ str: 'Caring for seedlings', fontSize: 18 }),
      ]),
    );
  } finally {
    await pdf.loadingTask.destroy();
  }
});
