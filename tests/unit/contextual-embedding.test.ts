// TC-209 / UT-43 / FR-75 / TRD §33.6.
import { expect, test } from 'vitest';
import { chunkEmbeddingInput, type Chunk } from '@/lib/ingest/chunk';
import { prepareChunkEmbedding } from '@/lib/ingest/upsert';
import { sha256Hex } from '@/lib/hash';
import { verifyCitations } from '@/lib/citations/verify';
import type { Passage } from '@/lib/retrieval/types';
import { previewCorpus } from '@/lib/ingest/preview';
import { countTokens } from '@/lib/ingest/tokenizer';

const document = {
  title: 'A unique document title',
  slug: 'manual:guide.md',
  locationSlug: 'guide.md',
};
const chunk: Chunk = {
  ordinal: 0,
  anchor: 'guide.md#section',
  headingPath: ['Guide', 'Section'],
  content: 'Water the seed tray every morning.',
  tokenCount: 7,
};

test('TC-209: UT-43 exact input and versioned hash preserve v1 with the flag off', () => {
  const original = structuredClone(chunk);
  const off = prepareChunkEmbedding(document, chunk, false);
  const on = prepareChunkEmbedding(document, chunk, true);
  expect(chunkEmbeddingInput(document.title, chunk, false)).toBe(
    'Guide › Section\n\nWater the seed tray every morning.',
  );
  expect(on.embeddingInput).toBe(
    'A unique document title\nGuide › Section\n\nWater the seed tray every morning.',
  );
  expect(off).toMatchObject({
    embedTextVersion: 0,
    contentHash: sha256Hex('guide.md\nguide.md#section\nWater the seed tray every morning.'),
  });
  expect(on).toMatchObject({
    embedTextVersion: 1,
    contentHash: sha256Hex(`1\0${on.embeddingInput}`),
  });
  const hashes = [false, true, true, false, false].map(
    (flag) => prepareChunkEmbedding(document, chunk, flag).contentHash,
  );
  expect(hashes.slice(1).map((hash, index) => hash !== hashes[index])).toEqual([
    true,
    false,
    true,
    false,
  ]);
  expect(
    prepareChunkEmbedding({ ...document, title: 'Changed title' }, chunk, true).contentHash,
  ).not.toBe(on.contentHash);
  expect(
    prepareChunkEmbedding(document, { ...chunk, headingPath: ['Changed heading'] }, true)
      .contentHash,
  ).not.toBe(on.contentHash);
  expect(chunk).toEqual(original);
});

test.each([false, true])(
  'TC-209: UT-43 display and quote verification retain only chunk content (%s)',
  async (flag) => {
    prepareChunkEmbedding(document, chunk, flag);
    const passage: Passage = {
      label: 'P1',
      content: chunk.content,
      chunkId: '1',
      documentTitle: document.title,
      documentUrl: 'https://example.com/guide',
      slug: document.slug,
      anchor: chunk.anchor,
      headingPath: chunk.headingPath,
      tokenCount: chunk.tokenCount,
      rrfScore: 1,
      vectorRank: 1,
      ftsRank: null,
      vectorDistance: 0,
      ftsScore: null,
      rerankPosition: 1,
      officialUrl: 'https://example.com/guide#section',
    };
    const verify = (quote: string) =>
      verifyCitations(
        'Advice [P1].',
        JSON.stringify({ citations: [{ id: 'P1', quote }] }),
        [passage],
        () => Promise.resolve(new Map<string, string>()),
      );
    expect((await verify(chunk.content)).notFound).toBe(false);
    expect((await verify(document.title)).notFound).toBe(true);
    expect(passage.content).toBe('Water the seed tray every morning.');
  },
);

test('TC-209: UT-43 preview uses contextual hashes and embedding token counts', () => {
  const parsed = {
    title: 'Title',
    root: {
      id: 'root',
      heading: 'Title',
      level: 1,
      blocks: [{ kind: 'paragraph' as const, text: 'Content.' }],
      children: [],
    },
  };
  const preview = previewCorpus([{ slug: 'guide.md', document: parsed }], 0.02, true);
  const input = 'Title\nTitle\n\nContent.';
  expect(preview.embeddingTokens).toBe(countTokens(input));
  expect(preview.corpusVersion).toBe(sha256Hex(sha256Hex(`1\0${input}`)));
});
