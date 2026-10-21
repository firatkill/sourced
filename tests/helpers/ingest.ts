import { sha256Hex } from '@/lib/hash';
import { countTokens } from '@/lib/ingest/tokenizer';
import type { IngestDocument } from '@/lib/ingest/upsert';

export function ingestDocument(
  slug: string,
  contents: string[],
  isFixture = false,
): IngestDocument {
  return {
    slug,
    url: `https://example.test/${slug}`,
    title: 'Test document',
    version: '17',
    section: 'test',
    contentHash: sha256Hex(contents.join('\n')),
    isFixture,
    chunks: contents.map((content, ordinal) => ({
      ordinal,
      content,
      anchor: `${slug}#ROOT`,
      headingPath: ['Test document'],
      tokenCount: countTokens(content),
    })),
  };
}
