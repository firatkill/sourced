import { expect, test } from 'vitest';
import { loadCorpus } from '@/lib/ingest/load';

test('TC-045: offline loader reads all pinned pages and explicitly includes the synthetic fixture', async () => {
  const documents = await loadCorpus({ offline: true, refresh: false, includeFixtures: true });
  expect(documents).toHaveLength(36);
  expect(documents.filter((doc) => doc.isFixture).map((doc) => doc.slug)).toEqual([
    'injected-notice.html',
  ]);
  expect(documents.every((doc) => doc.chunks.length > 0 && doc.contentHash.length === 64)).toBe(
    true,
  );
  expect(
    documents.find((doc) => doc.isFixture)?.chunks.some((chunk) => chunk.content.includes('PWNED')),
  ).toBe(true);
});
