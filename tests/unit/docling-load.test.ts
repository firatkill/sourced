// T-100 / D-152: which reader each file gets, with a fake Docling.
/* eslint-disable @typescript-eslint/require-await -- the fakes stand in for async APIs */
import { readFileSync } from 'node:fs';
import { describe, expect, test, vi } from 'vitest';
import { DoclingUnavailableError, unavailable, type DoclingConvert } from '@/lib/ingest/docling';
import { loadCorpus } from '@/lib/ingest/load';
import { KitConfigSchema } from '@/lib/kit/config-schema';
import fixtureConfig from '../fixtures/kit-tr/sourced.config';

const json = (name: string): unknown =>
  JSON.parse(readFileSync(`tests/fixtures/docling/${name}`, 'utf8'));
const config = (engine?: 'builtin' | 'docling') =>
  KitConfigSchema.parse({
    ...fixtureConfig,
    ...(engine ? { parsing: { engine } } : {}),
    sources: [{ id: 'slides', type: 'folder', path: 'tests/fixtures/docling/slides' }],
  });
const fake = (): DoclingConvert & ReturnType<typeof vi.fn> =>
  vi.fn(async (_bytes: Uint8Array, input: Parameters<DoclingConvert>[1]) =>
    json(input.kind === 'pptx' ? 'powerpoint_sample.pptx.json' : 'multi_page.pdf.json'),
  );
const load = (
  engine: 'builtin' | 'docling' | undefined,
  docling?: DoclingConvert,
  readOnly = false,
) =>
  loadCorpus({
    config: config(engine),
    offline: true,
    refresh: false,
    includeFixtures: false,
    readOnly,
    ...(docling ? { docling } : {}),
  });

describe('T-100: Docling in the loader', () => {
  test('without Docling, PDFs use the built-in reader and slides are skipped', async () => {
    const docling = fake();
    const documents = await load(undefined, docling);
    expect(docling).not.toHaveBeenCalled();
    expect(documents.map((document) => document.slug)).toEqual(['slides:report.pdf']);
    expect(documents.skippedItems).toEqual([{ key: 'slides:deck.pptx', reason: 'needs_docling' }]);
  });

  test('with Docling, PDF and PowerPoint files are read by it in the corpus language', async () => {
    const docling = fake();
    const documents = await load('docling', docling);
    expect(docling).toHaveBeenCalledTimes(2);
    expect(docling.mock.calls.map((call) => (call[1] as { kind: string }).kind).sort()).toEqual([
      'pdf',
      'pptx',
    ]);
    expect((docling.mock.calls[0]?.[1] as { language: string }).language).toBe(
      config('docling').corpus.language,
    );
    const deck = documents.find((document) => document.slug === 'slides:deck.pptx');
    expect(deck?.title).toBe('Test Table Slide');
    expect(deck?.chunks[0]?.headingPath[1]).toBe('Slide 1: Test Table Slide');
    const report = documents.find((document) => document.slug === 'slides:report.pdf');
    expect(report?.title).toBe('The Evolution of the Word Processor');
    expect(report?.chunks[0]?.pageFrom).toBe(1);
  });

  test('Docling not running stops the whole run instead of failing files one by one', async () => {
    const docling = vi.fn(async () => {
      throw unavailable();
    }) as unknown as DoclingConvert;
    await expect(load('docling', docling)).rejects.toBeInstanceOf(DoclingUnavailableError);
  });

  test('one file Docling cannot read fails alone', async () => {
    const docling = vi.fn(async (_bytes: Uint8Array, input: Parameters<DoclingConvert>[1]) => {
      if (input.kind === 'pdf') throw new Error('Docling could not read report.pdf.');
      return json('powerpoint_sample.pptx.json');
    }) as unknown as DoclingConvert;
    const documents = await load('docling', docling);
    expect(documents.failedKeys).toEqual(['slides:report.pdf']);
    expect(documents.map((document) => document.slug)).toEqual(['slides:deck.pptx']);
  });

  test('a dry run (the cost estimate) never waits for Docling on a PDF', async () => {
    const docling = vi.fn(
      async (
        _bytes: Uint8Array,
        input: Parameters<DoclingConvert>[1],
        options?: { cacheOnly?: boolean },
      ) => {
        if (options?.cacheOnly) return undefined;
        return json(input.kind === 'pptx' ? 'powerpoint_sample.pptx.json' : 'multi_page.pdf.json');
      },
    ) as unknown as DoclingConvert & ReturnType<typeof vi.fn>;
    const documents = await load('docling', docling, true);
    const pdfCall = docling.mock.calls.find((call) => (call[1] as { kind: string }).kind === 'pdf');
    expect(pdfCall?.[2]).toEqual({ cacheOnly: true });
    // Not converted yet: the built-in reader counts its tokens.
    const report = documents.find((document) => document.slug === 'slides:report.pdf');
    expect(report?.title).not.toBe('The Evolution of the Word Processor');
    expect(report?.chunks.length).toBeGreaterThan(0);
  });

  test('a dry run with Docling stopped skips slides instead of failing', async () => {
    const docling = vi.fn(
      async (_bytes: Uint8Array, _input: unknown, options?: { cacheOnly?: boolean }) => {
        if (options?.cacheOnly) return undefined;
        throw unavailable();
      },
    ) as unknown as DoclingConvert;
    const documents = await load('docling', docling, true);
    expect(documents.skippedItems).toEqual([{ key: 'slides:deck.pptx', reason: 'needs_docling' }]);
  });
});
