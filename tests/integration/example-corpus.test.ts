import { expect, test } from 'vitest';
import { z } from 'zod';
import { getSql } from '@/lib/db/client';
import { EMBEDDING } from '@/lib/config';
import { loadCorpus } from '@/lib/ingest/load';
import { ingestCorpus } from '@/lib/ingest/upsert';
import { mockProvider } from '@/lib/llm/mock';
import baselineJson from '../fixtures/postgres-17-v1-chunks.json';

const baseline = z
  .array(
    z.object({
      slug: z.string(),
      ordinal: z.number().int(),
      content_hash: z.string().regex(/^[a-f0-9]{64}$/),
    }),
  )
  .parse(baselineJson);

test('IT-16 / T-50 / NFR-16: relocated example ingests identical v1 chunk hashes and counts', async () => {
  const options = {
    sql: getSql(),
    loadDocuments: () => loadCorpus({ offline: true, refresh: false, includeFixtures: false }),
    provider: mockProvider,
    embeddingModel: EMBEDDING.MOCK_MODEL,
    includeFixtures: false,
    pricePerMillion: 0,
  };
  const first = await ingestCorpus(options);
  expect(first.documentsTotal).toBe(new Set(baseline.map((row) => row.slug)).size);
  expect(first.chunksTotal).toBe(baseline.length);
  const rows = await options.sql<{ slug: string; ordinal: number; content_hash: string }[]>`
    SELECT d.slug,c.ordinal,c.content_hash FROM chunks c
    JOIN documents d ON d.id=c.document_id WHERE NOT d.is_fixture ORDER BY d.slug,c.ordinal`;
  expect(Array.from(rows)).toEqual(baseline);
  const second = await ingestCorpus(options);
  expect(second).toMatchObject({
    documentsChanged: 0,
    documentsRemoved: 0,
    chunksInserted: 0,
    chunksUpdated: 0,
    chunksDeleted: 0,
    chunksUnchanged: baseline.length,
    embeddingInputs: 0,
  });
});
