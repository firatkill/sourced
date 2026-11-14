import { expect, test } from 'vitest';
import { EMBEDDING } from '@/lib/config';
import { getSql } from '@/lib/db/client';
import { ingestCorpus } from '@/lib/ingest/upsert';
import { mockProvider } from '@/lib/llm/mock';
import { search } from '@/lib/retrieval/search';
import { ingestDocument } from '../helpers/ingest';

// T-46 / FR-67 / D-92 / TRD IT-15.
test('TC-175: IT-15 identical text belongs to both documents and both hybrid search results', async () => {
  const sql = getSql();
  const content = 'Partial indexes improve queries with a matching predicate.';
  const documents = ['shared-first.html', 'shared-second.html'].map((slug) =>
    ingestDocument(slug, [content]),
  );
  const options = {
    sql,
    loadDocuments: () => Promise.resolve(documents),
    provider: mockProvider,
    embeddingModel: EMBEDDING.MOCK_MODEL,
    includeFixtures: false,
    pricePerMillion: 0,
  };
  expect(await ingestCorpus(options)).toMatchObject({ chunksInserted: 2 });
  const rows = await sql<{ id: string; document_id: string; content_hash: string }[]>`
    SELECT c.id::text, c.document_id::text, c.content_hash FROM chunks c
    JOIN documents d ON d.id=c.document_id
    WHERE d.slug = ANY(${sql.array(
      documents.map((doc) => doc.slug),
      25,
    )}::text[]) ORDER BY c.id`;
  expect(rows).toHaveLength(2);
  expect(new Set(rows.map((row) => row.document_id)).size).toBe(2);
  expect(await ingestCorpus(options)).toMatchObject({
    chunksInserted: 0,
    chunksUpdated: 0,
    chunksDeleted: 0,
    chunksUnchanged: 2,
  });
  // V1 hashes include the slug. Equalize them to exercise the new database
  // constraint independently of the unchanged v1 hash algorithm.
  await sql`UPDATE chunks SET content_hash=${rows[0]!.content_hash} WHERE id=${rows[1]!.id}`;
  expect(await sql`SELECT id FROM chunks WHERE content_hash=${rows[0]!.content_hash}`).toHaveLength(
    2,
  );
  await expect(sql`INSERT INTO chunks
    (document_id,ordinal,heading_path,anchor,content,token_count,content_hash,embedding_model,embedding)
    SELECT document_id,ordinal+1,heading_path,anchor,content,token_count,content_hash,embedding_model,embedding
    FROM chunks WHERE id=${rows[0]!.id}`).rejects.toMatchObject({
    code: '23505',
    constraint_name: 'chunks_document_content_hash_key',
  });
  const embedded = await mockProvider.embed([content]);
  const result = await search(embedded.vectors[0]!, 'partial indexes');
  const hits = result.chunks.filter((chunk) => rows.some((row) => row.id === chunk.chunkId));
  expect(hits).toHaveLength(2);
  expect(hits.map((chunk) => chunk.slug).sort()).toEqual(documents.map((doc) => doc.slug).sort());
  for (const hit of hits) {
    expect(hit.content).toBe(content);
    expect(hit.vectorRank).not.toBeNull();
    expect(hit.ftsRank).not.toBeNull();
  }
});
