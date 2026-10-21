import { expect, test } from 'vitest';
import { assertIngestAllowed } from '@/lib/ingest/load';

test('TC-048: refuses ingestion when VERCEL is set', () => {
  expect(() => {
    assertIngestAllowed('1');
  }).toThrow('Ingestion is not allowed on Vercel.');
  expect(() => {
    assertIngestAllowed(undefined);
  }).not.toThrow();
});
