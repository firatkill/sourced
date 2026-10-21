import { readFile } from 'node:fs/promises';
import { expect, test, vi } from 'vitest';
import manifest from '@/corpus/manifest.json';
import { parseHtml } from '@/lib/ingest/parse-html';
const page = {
  slug: 'structures.html',
  section: 'test',
  contentSelector: manifest.contentSelector,
  removeSelectors: manifest.removeSelectors,
};
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ warn: vi.fn() }) }));

test('TC-037: UT-02 real PostgreSQL section div ids and heading paths survive parsing', async () => {
  for (const [slug, id, heading] of [
    ['indexes-partial.html', 'INDEXES-PARTIAL', '11.8. Partial Indexes'],
    ['transaction-iso.html', 'TRANSACTION-ISO', '13.2. Transaction Isolation'],
    ['datatype-json.html', 'DATATYPE-JSON', '8.14. JSON Types'],
  ]) {
    const doc = parseHtml(await readFile(`tests/fixtures/html/${slug!}`, 'utf8'), {
      ...page,
      slug: slug!,
    });
    expect(doc.title).toBe(heading);
    expect(doc.root.id).toBe(id);
    expect(doc.root.level).toBe(1);
    expect(doc.root.blocks.length).toBeGreaterThan(0);
    if (slug === 'transaction-iso.html')
      expect(doc.root.children.map((s) => s.id)).toEqual([
        'XACT-READ-COMMITTED',
        'XACT-REPEATABLE-READ',
      ]);
  }
});

test('TC-037: UT-02 block kinds, text normalization, nested sections and inherited ids', async () => {
  const doc = parseHtml(await readFile('tests/fixtures/html/structures.html', 'utf8'), page);
  expect(doc.root.blocks).toEqual([
    { kind: 'paragraph', text: 'Text with inline_code and spacing.' },
    { kind: 'list', items: ['First item', 'Second item'], ordered: false },
    { kind: 'list', items: ['Ordered item'], ordered: true },
    { kind: 'code', text: 'SELECT 1;\nSELECT 2;' },
    { kind: 'table', rows: ['Name | Value', 'key | data'] },
    { kind: 'paragraph', text: 'Term: Definition with code.' },
    { kind: 'note', label: 'Note', text: 'Remember this.' },
  ]);
  expect(doc.root.children[0]).toMatchObject({
    id: 'CHILD',
    level: 2,
    heading: '1.1. Child',
    blocks: [{ kind: 'paragraph', text: 'Child text.' }],
  });
  expect(doc.root.children[0]?.children[0]).toMatchObject({
    id: 'CHILD',
    level: 3,
    heading: 'No id',
    blocks: [{ kind: 'paragraph', text: 'Inherited anchor.' }],
  });
});

test('TC-037: UT-02 D-57 unclassed reference headings and body fallback', () => {
  const html =
    '<body><div class="refentry" id="SQL-TEST"><div><h2>CREATE TEST</h2></div><p>Reference intro.</p><div class="refsect1" id="PARAMETERS"><h2>Parameters</h2><p>Options.</p></div></div></body>';
  const doc = parseHtml(html, page);
  expect(doc.title).toBe('CREATE TEST');
  expect(doc.root.heading).toBe('CREATE TEST');
  expect(doc.root.children[0]?.heading).toBe('Parameters');
});
