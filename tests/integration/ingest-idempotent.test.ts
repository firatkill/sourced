import { expect, test, vi } from 'vitest';
import { getSql } from '@/lib/db/client';
import { EMBEDDING } from '@/lib/config';
import { mockProvider } from '@/lib/llm/mock';
import { ingestCorpus, type IngestDocument } from '@/lib/ingest/upsert';
import { ingestDocument } from '../helpers/ingest';

const run = (
  documents: IngestDocument[],
  embed = vi.fn(mockProvider.embed.bind(mockProvider)),
  includeFixtures = false,
  embeddingModel: string = EMBEDDING.MOCK_MODEL,
  contextualEmbedding?: boolean,
) =>
  ingestCorpus({
    sql: getSql(),
    loadDocuments: () => Promise.resolve(documents),
    provider: { embed },
    embeddingModel,
    includeFixtures,
    pricePerMillion: 0,
    ...(contextualEmbedding === undefined ? {} : { contextualEmbedding }),
  });

test('TC-046: IT-05 unchanged ingest makes zero embedding calls and changes no chunk timestamps', async () => {
  const documents = [
    ingestDocument('unchanged.html', ['First unchanged passage.', 'Second unchanged passage.']),
  ];
  const first = await run(documents);
  const before = await getSql()`SELECT id,updated_at FROM chunks ORDER BY id`;
  const embed = vi.fn(mockProvider.embed.bind(mockProvider));
  const second = await run(documents, embed);
  expect(embed).not.toHaveBeenCalled();
  expect(second).toMatchObject({
    chunksInserted: 0,
    chunksUpdated: 0,
    chunksDeleted: 0,
    chunksUnchanged: 2,
    documentsChanged: 0,
    embeddingTokens: 0,
    corpusVersion: first.corpusVersion,
  });
  expect(await getSql()`SELECT id,updated_at FROM chunks ORDER BY id`).toEqual(before);
});

test('TC-047: IT-05 reorder updates unchanged rows, content change embeds only its new hash', async () => {
  // TRD §33.6: heading edits leave hashes unchanged only under the v1 hash scheme.
  const runV1 = (
    documents: IngestDocument[],
    embed?: ReturnType<typeof vi.fn<typeof mockProvider.embed>>,
  ) => run(documents, embed, false, EMBEDDING.MOCK_MODEL, false);
  const doc = ingestDocument('change.html', [
    'First passage unchanged.',
    'Second passage unchanged.',
  ]);
  await runV1([doc]);
  const embed = vi.fn(mockProvider.embed.bind(mockProvider));
  const swapped = {
    ...doc,
    chunks: [...doc.chunks]
      .reverse()
      .map((chunk, ordinal) => ({ ...chunk, ordinal, headingPath: ['Updated heading', 'Child'] })),
  };
  const reordered = await runV1([swapped], embed);
  expect(reordered).toMatchObject({ chunksInserted: 0, chunksUpdated: 2, chunksUnchanged: 0 });
  expect(embed).not.toHaveBeenCalled();
  const rows = await getSql()<
    { content: string; heading_path: string[] }[]
  >`SELECT content,heading_path FROM chunks ORDER BY ordinal`;
  expect(rows.map((row) => row.content)).toEqual(swapped.chunks.map((chunk) => chunk.content));
  expect(rows[0]?.heading_path).toEqual(['Updated heading', 'Child']);
  const changed = ingestDocument('change.html', [
    'Second passage unchanged.',
    'Changed third passage.',
  ]);
  const result = await runV1([changed], embed);
  expect(result).toMatchObject({ chunksInserted: 1, chunksDeleted: 1, embeddingInputs: 1 });
  expect(embed).toHaveBeenCalledTimes(1);
  expect(embed.mock.calls[0]?.[0]).toHaveLength(1);
});

test('TC-047: IT-05 removes absent documents and excluded fixtures, replacing every vector on model change', async () => {
  const keep = ingestDocument('keep.html', ['Keep this passage.']);
  const remove = ingestDocument('remove.html', ['Remove this passage.']);
  const fixture = ingestDocument('fixture.html', ['Synthetic fixture content.'], true);
  await run([keep, remove, fixture], vi.fn(mockProvider.embed.bind(mockProvider)), true);
  const excluded = await run([keep, fixture]);
  expect(excluded).toMatchObject({ documentsRemoved: 2, chunksDeleted: 2, documentsTotal: 1 });
  const embed = vi.fn(mockProvider.embed.bind(mockProvider));
  const changed = await run([keep], embed, false, 'test-model-v2');
  expect(changed).toMatchObject({ embeddingInputs: 1, chunksInserted: 1, chunksDeleted: 1 });
  expect(embed).toHaveBeenCalledTimes(1);
  const rows = await getSql()<{ embedding_model: string }[]>`SELECT embedding_model FROM chunks`;
  expect(rows.map((row) => row.embedding_model)).toEqual(['test-model-v2']);
});

// TRD §33.6 hashes embedding input, which excludes ordinal under both flag values.
test.each([false, true])(
  'TC-047: IT-05 pure reordering preserves vectors and only new content embeds (contextualEmbedding=%s)',
  async (contextualEmbedding) => {
    const embed = vi.fn(mockProvider.embed.bind(mockProvider));
    const ingest = (documents: IngestDocument[]) =>
      run(documents, embed, false, EMBEDDING.MOCK_MODEL, contextualEmbedding);
    const doc = ingestDocument(`reorder-${String(contextualEmbedding)}.html`, [
      'First passage unchanged.',
      'Second passage unchanged.',
    ]);
    await ingest([doc]);
    const read = () => getSql()<
      {
        id: string;
        content: string;
        content_hash: string;
        heading_path: string[];
        embedding: string;
      }[]
    >`
   SELECT id::text, content, content_hash, heading_path, embedding::text FROM chunks ORDER BY ordinal`;
    const before = await read();
    embed.mockClear();
    const swapped = {
      ...doc,
      chunks: [...doc.chunks].reverse().map((chunk, ordinal) => ({ ...chunk, ordinal })),
    };
    const reordered = await ingest([swapped]);
    expect(reordered).toMatchObject({
      chunksInserted: 0,
      chunksUpdated: 2,
      chunksUnchanged: 0,
      embeddingInputs: 0,
    });
    expect(embed).not.toHaveBeenCalled();
    expect(await read()).toEqual([...before].reverse());
    const changed = ingestDocument(doc.slug, [
      'Second passage unchanged.',
      'Changed third passage.',
    ]);
    const result = await ingest([changed]);
    expect(result).toMatchObject({ chunksInserted: 1, chunksDeleted: 1, embeddingInputs: 1 });
    expect(embed).toHaveBeenCalledTimes(1);
    expect(embed.mock.calls[0]?.[0]).toHaveLength(1);
    expect((await read())[0]).toEqual(before[1]);
  },
);
