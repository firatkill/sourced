// TC-192 / T-52: temporary M5 conversion preserves original fixture structures.
import { execFileSync } from 'node:child_process';
import { fixtureCopy } from '../fixtures/kit-tr/copy';
import { expect, test } from 'vitest';
import { convertFixture, loadFixtureDocuments } from '../fixtures/kit-tr/convert';
import { fixtureDatabaseUrl } from '../fixtures/kit-tr/database';

test('TC-192: original Markdown and HTML retain headings, code, tables and provenance', async () => {
  const documents = await loadFixtureDocuments();
  expect(documents).toHaveLength(4);
  expect(documents.filter((doc) => doc.slug.endsWith('.md'))).toHaveLength(2);
  expect(documents.filter((doc) => doc.slug.endsWith('.html'))).toHaveLength(2);
  for (const doc of documents) {
    expect(doc.chunks.length).toBeGreaterThan(0);
    expect(
      doc.chunks.every(
        (chunk) =>
          chunk.anchor.startsWith(`${doc.locationSlug ?? doc.slug}#`) &&
          chunk.headingPath[0] === doc.title,
      ),
    ).toBe(true);
  }
  const content = documents.flatMap((doc) => doc.chunks.map((chunk) => chunk.content)).join('\n');
  expect(content).toContain('cep-bahcesi ekle --ad "Mavi saksı" --konum balkon');
  expect(content.replace(/\s+/g, ' ')).toContain('| Kumlu | Pazartesi | Nemi ölç |');
  expect(content).toContain('Saksılarınızın');
  const parsed = convertFixture(
    '# Başlık\n\n## Alt başlık\n\n```text\nkomut\n```\n\n| A | B |\n| --- | --- |\n| bir | iki |',
    '.md',
  );
  expect(parsed.root.children[0]?.blocks).toEqual([
    { kind: 'code', text: 'komut' },
    { kind: 'table', rows: ['| A | B |', '| bir | iki |'] },
  ]);
});

test('TC-192: setup always selects the separate local fixture database', () => {
  for (const database of ['sourced', 'sourced_test', 'sourced_kit_tr']) {
    expect(
      new URL(fixtureDatabaseUrl(`postgres://localhost:5433/${database}?options=ignored`)).pathname,
    ).toBe('/sourced_kit_tr');
    expect(
      new URL(fixtureDatabaseUrl(`postgres://localhost:5433/${database}?options=ignored`)).search,
    ).toBe('');
  }
  expect(() => fixtureDatabaseUrl('postgres://remote.example/sourced')).toThrow(/localhost/);
  expect(() => fixtureDatabaseUrl(undefined)).toThrow(/localhost/);
});

// Vitest aliases server-only to an empty module; a subprocess must exercise the real guard.
test('TC-192 / E2E-26: public fixture copy imports without the react-server condition', () => {
  const output = execFileSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '--eval',
      "import { fixtureCopy } from './tests/fixtures/kit-tr/copy.ts'; process.stdout.write(JSON.stringify(fixtureCopy));",
    ],
    { encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '' } },
  );
  expect(output).toBe(JSON.stringify(fixtureCopy));
});
