import packageJson from '@/package.json';
// UT-33 / FR-63, FR-74 / D-91, D-100: copy is config-driven; example stays byte-identical.
import { afterEach, expect, test, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import example from '@/sourced.config';
import { getCopy, uiCopy } from '@/lib/kit/copy';
import { KitConfigSchema } from '@/lib/kit/config-schema';
import { ASK_COPY } from '../helpers/runtime-copy';
import { renderAnswerSystemPrompt } from '@/lib/prompts/system';
import { renderRerankSystemPrompt } from '@/lib/prompts/rerank';
import { getPageCopy } from '@/lib/kit/copy-server';
import * as runtime from '@/lib/kit/runtime-config';
import { V1_COPY } from '../fixtures/v1-copy';

const sql = vi.hoisted(() =>
  vi.fn<(query: TemplateStringsArray) => Promise<{ documents_total: number }[]>>(),
);
vi.mock('@/lib/db/client', () => ({ getSql: () => sql }));
afterEach(() => {
  vi.restoreAllMocks();
  sql.mockReset();
});
const config = () => KitConfigSchema.parse(example);
const defaults = () => {
  const value = config();
  value.corpus = {
    name: 'guide',
    title: 'Guide',
    description: 'the indexed guide',
    language: 'en',
    linkLabel: 'Read the source',
  };
  value.copy = { suggested: [] };
  return value;
};

test('UT-33 / D-140: all default strings are generic and absent optional content stays out', () => {
  expect(getCopy(defaults(), 12)).toEqual({
    citationMarkers: '[P1], [P2], [P3], [P4], [P5] or [P6]',
    documentTitle: 'Sourced',
    hero: 'What do you want to know?',
    lead: 'Answers come only from your documents. Every claim links to the passage it came from, checked before you see it.',
    notFound: "I couldn't find this in your documents.",
    notFoundHeading: 'I couldn’t find this in your documents.',
    notFoundBody:
      'Sourced only answers from the 12 documents it has indexed. These passages came closest:',
    docsLink: 'Read the source',
    railSubtitle: 'Your documents',
    headerScope: 'Answers only from your documents',
    scope: 'Answers come only from your documents. If the answer is not there, Sourced says so.',
    placeholder: 'Ask about your documents',
    nextPlaceholder: 'Ask a follow-up',
    searched: 'Searched 12 documents',
    viewerLink: 'Open the source',
    promptSubject: 'Guide',
    rerankSubject: 'Guide',
    preparationSubject: 'Your documents',
    suggested: [],
  });
});

test('D-140: a corpus without copy never shows its title or description in UI strings', () => {
  const value = defaults();
  value.corpus.title = 'My documents';
  value.corpus.description = 'Answers from your own documents';
  const { promptSubject, rerankSubject, ...ui } = getCopy(value, 4);
  expect(promptSubject).toBe('My documents'); // prompts may name the corpus
  expect(rerankSubject).toBe('My documents');
  for (const [key, text] of Object.entries(ui)) {
    const serialized = JSON.stringify(text);
    expect(serialized, key).not.toContain('My documents');
    expect(serialized, key).not.toContain('Answers from your own documents');
  }
});

test('D-140: uiCopy keeps prompt subjects on the server', () => {
  const value = defaults();
  value.corpus.title = 'My documents';
  const ui = uiCopy(getCopy(value, 4));
  expect(ui).not.toHaveProperty('promptSubject');
  expect(ui).not.toHaveProperty('rerankSubject');
  expect(JSON.stringify(ui)).not.toContain('My documents');
  expect(ui.hero).toBe('What do you want to know?');
});

test('UT-33: example reproduces every existing UI string, including redesign overrides', () => {
  for (const [key, value] of Object.entries(V1_COPY))
    expect(ASK_COPY[key as keyof typeof V1_COPY], key).toEqual(value);
  const copy = getCopy(config());
  expect(copy.documentTitle).toBe('Sourced: answers that show their sources');
  expect(copy.license).toEqual({
    name: 'PostgreSQL License',
    url: 'https://www.postgresql.org/about/licence/',
  });
  expect(copy.preparationSubject).toBe('The 35 PostgreSQL 17 documentation pages');
  expect(copy.corpusLimit).toBe('The corpus is 35 pages, not the full PostgreSQL documentation.');
  expect(copy.exampleNotice).toBe(
    "You're trying Sourced with an example: 35 pages of the PostgreSQL 17 docs.",
  );
  expect(copy.suggested).toEqual([
    {
      id: 'iso',
      topic: 'Transactions',
      question: 'What is the difference between REPEATABLE READ and SERIALIZABLE?',
    },
    { id: 'partial', topic: 'Indexes', question: 'When should I use a partial index?' },
    {
      id: 'explain',
      topic: 'Performance',
      question: 'How do I read the output of EXPLAIN ANALYZE?',
    },
    { id: 'jsonb', topic: 'Data types', question: 'Should I store JSON as json or jsonb?' },
    {
      id: 'rls',
      topic: 'Security',
      question: 'How does row-level security decide which rows a user can see?',
    },
    {
      id: 'wraparound',
      topic: 'Maintenance',
      question: 'Why does VACUUM matter, and what is transaction ID wraparound?',
    },
  ]);
});

test('UT-33: explicit overrides win; optional topic stays omitted', () => {
  const value = defaults();
  value.copy = {
    ...config().copy,
    promptSubject: 'Other guide',
    rerankSubject: 'Other',
    suggested: [{ id: 'custom', text: 'A custom question?' }],
  };
  const copy = getCopy(value, 999);
  expect(copy.hero).toBe(config().copy.hero);
  expect(copy.searched).toBe('Searched 35 pages');
  expect(copy.suggested).toEqual([{ id: 'custom', question: 'A custom question?' }]);
  expect(renderAnswerSystemPrompt(value)).toContain('questions about Other guide');
  expect(renderRerankSystemPrompt(value)).toContain('question about Other.');
  expect(renderAnswerSystemPrompt(value)).not.toContain('questions about PostgreSQL');
});

test('UT-33: client artifact contains only rendered public copy, not models or source config', async () => {
  expect(JSON.parse(await readFile('.sourced/copy.json', 'utf8'))).toEqual(getCopy(config()));
});

test('UT-33: runtime document count is read from corpus_meta for default templates', async () => {
  vi.spyOn(runtime, 'getKitConfig').mockReturnValue(defaults());
  sql.mockResolvedValue([{ documents_total: 17 }]);
  const copy = await getPageCopy();
  expect(copy.searched).toBe('Searched 17 documents');
  expect(copy.notFoundBody).toContain('17 documents');
  expect(sql.mock.calls[0]?.[0].join('')).toContain('FROM corpus_meta');
});

test('UT-33: explicit example counts do not require a database query', async () => {
  vi.spyOn(runtime, 'getKitConfig').mockReturnValue(config());
  expect((await getPageCopy()).searched).toBe('Searched 35 pages');
  expect(sql).not.toHaveBeenCalled();
});

test('UT-33: finalPassages supports 1–9 and rejects 10', () => {
  for (const count of [1, 6, 9]) {
    const value = config();
    value.overrides.retrieval.finalPassages = count;
    expect(KitConfigSchema.safeParse(value).success).toBe(true);
    const rule = renderAnswerSystemPrompt(value)
      .split('\n')
      .find((line) => line.startsWith('2.'));
    expect(rule).toContain(`[P${String(count)}]`);
  }
  const value = config();
  value.overrides.retrieval.finalPassages = 10;
  expect(KitConfigSchema.safeParse(value).success).toBe(false);
});

test('UT-33: entrypoints regenerate copy before loading its consumers', () => {
  for (const name of ['dev', 'build', 'lint', 'typecheck', 'db:seed', 'cache:suggested'] as const)
    expect(packageJson.scripts[name], name).toMatch(/^pnpm config:snapshot && /);
  // T-58: these entrypoints now regenerate the snapshot inside the CLI handler.
  expect(packageJson.scripts.ingest).toBe('pnpm sourced ingest');
  expect(packageJson.scripts['corpus:fetch']).toBe('pnpm sourced ingest --fetch-only');
  expect(packageJson.scripts.eval).toBe('pnpm sourced eval');
});
