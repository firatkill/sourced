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
) =>
  ingestCorpus({
    sql: getSql(),
    loadDocuments: () => Promise.resolve(documents),
    provider: { embed },
    embeddingModel,
    includeFixtures,
    pricePerMillion: 0,
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
  const doc = ingestDocument('change.html', [
    'First passage unchanged.',
    'Second passage unchanged.',
  ]);
  await run([doc]);
  const embed = vi.fn(mockProvider.embed.bind(mockProvider));
  const swapped = {
    ...doc,
    chunks: [...doc.chunks]
      .reverse()
      .map((chunk, ordinal) => ({ ...chunk, ordinal, headingPath: ['Updated heading', 'Child'] })),
  };
  const reordered = await run([swapped], embed);
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
  const result = await run([changed], embed);
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
