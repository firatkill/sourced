// TC-201 / UT-41 / FR-67, FR-70 / D-102: DOCX parser to report and verified SSE.
import { expect, test } from 'vitest';
import { getSql } from '@/lib/db/client';
import { getKitConfig } from '@/lib/kit/runtime-config';
import { SourceSchema } from '@/lib/kit/config-schema';
import { EMBEDDING } from '@/lib/config';
import { mockProvider } from '@/lib/llm/mock';
import { loadCorpus } from '@/lib/ingest/load';
import { ingestCorpus } from '@/lib/ingest/upsert';
import { formatIngestReport } from '@/lib/ingest/report';
import { answerQuestion } from '@/lib/generation/answer';
import { SseEvent } from '@/lib/sse/events';

test('TC-201: DOCX warnings reach the ingest report; retrieved file citations have no link', async () => {
  const config = getKitConfig();
  config.sources = [
    SourceSchema.parse({
      id: 'docx',
      type: 'folder',
      path: 'tests/fixtures/docx',
      include: ['*.docx'],
    }),
  ];
  const documents = await loadCorpus({
    config,
    offline: true,
    refresh: false,
    includeFixtures: false,
  });
  const report = await ingestCorpus({
    sql: getSql(),
    loadDocuments: () => Promise.resolve(documents),
    provider: mockProvider,
    embeddingModel: EMBEDDING.MOCK_MODEL,
    includeFixtures: false,
    pricePerMillion: 0,
  });
  expect(report).toMatchObject({ documentsTotal: 5, warnings: 1 });
  expect(formatIngestReport(report, new Date('2026-11-10T00:00:00Z'))).toContain('warnings    1');
  const events: SseEvent[] = [];
  const result = await answerQuestion({
    question: 'How should I prepare soil and water plants?',
    requestId: crypto.randomUUID(),
    signal: new AbortController().signal,
    emit: (event) => {
      events.push(SseEvent.parse(event));
    },
  });
  expect(result.verification.notFound).toBe(false);
  const meta = events.find((event) => event.event === 'meta');
  expect(meta?.data.passages.length).toBeGreaterThan(0);
  for (const passage of meta?.data.passages ?? []) {
    expect(passage.officialUrl).toBeNull();
    expect(passage.filePath).toMatch(/^[^/]+\.docx$/);
    expect(passage.headingPath.length).toBeGreaterThan(0);
    expect(passage).not.toHaveProperty('pageFrom');
  }
});
