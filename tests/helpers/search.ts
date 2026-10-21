import type postgres from 'postgres';
import { EMBEDDING } from '@/lib/config';
import { sha256Hex } from '@/lib/hash';
import { chunkContentHash } from '@/lib/ingest/chunk';
import { countTokens } from '@/lib/ingest/tokenizer';

export async function insertSearchChunks(
  sql: postgres.Sql,
  slug: string,
  chunks: { content: string; vector: number[] }[],
): Promise<string[]> {
  const [document] = await sql<
    { id: string }[]
  >`INSERT INTO documents (slug,url,title,version,section,content_hash,fetched_at) VALUES (${slug},${`https://example.test/${slug}`},'Search fixture','17','test',${sha256Hex(slug)},now()) RETURNING id::text`;
  if (!document) throw new Error('Missing fixture document');
  const ids: string[] = [];
  for (const [ordinal, chunk] of chunks.entries()) {
    const anchor = `${slug}#${String(ordinal)}`;
    const [row] = await sql<
      { id: string }[]
    >`INSERT INTO chunks (document_id,ordinal,heading_path,anchor,content,token_count,content_hash,embedding_model,embedding) VALUES (${document.id},${ordinal},ARRAY['Search fixture'],${anchor},${chunk.content},${countTokens(chunk.content)},${chunkContentHash(slug, { anchor, content: chunk.content })},${EMBEDDING.MOCK_MODEL},${JSON.stringify(chunk.vector)}::vector) RETURNING id::text`;
    if (!row) throw new Error('Missing fixture chunk');
    ids.push(row.id);
  }
  return ids;
}
