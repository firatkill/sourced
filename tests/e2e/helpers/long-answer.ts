import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { SseEvent } from '@/lib/sse/events';

// TC-140: contract-validated transport fixture; no provider or mock trigger.
export async function routeLongAnswer(page: Page) {
  const requestId = randomUUID();
  const quote = 'A partial index contains only rows that satisfy its predicate.';
  const content = `${quote}\n\n${'unbroken'.repeat(100)}`;
  const answer = `${quote} [P1]\n\n\`\`\`sql\nSELECT ${'long_column, '.repeat(100)}last_column;\n\`\`\``;
  const events: SseEvent[] = [
    {
      event: 'meta',
      data: {
        requestId,
        cached: false,
        cachedAt: null,
        passages: [
          {
            label: 'P1',
            chunkId: randomUUID(),
            documentTitle: 'Partial Indexes',
            headingPath: ['Partial Indexes'],
            officialUrl: 'https://www.postgresql.org/docs/17/indexes-partial.html',
            snippet: quote,
            content,
            scores: { rrf: 0.03, vectorRank: 1, ftsRank: 1, rerankPosition: 1 },
          },
        ],
        retrieval: {
          vectorCandidates: 1,
          ftsCandidates: 1,
          rerankFallback: false,
          rerankFallbackReason: null,
          timingsMs: { embed: 1, search: 1, rerank: 1 },
        },
      },
    },
    ...[answer.slice(0, 30), answer.slice(30)].map((delta): SseEvent => ({
      event: 'token',
      data: { delta },
    })),
    {
      event: 'citations',
      data: {
        answer,
        notFound: false,
        valid: [{ label: 'P1', quote, quoteSpan: { start: 0, end: quote.length } }],
        invalid: [],
        quoteFallbackUsed: false,
      },
    },
    {
      event: 'done',
      data: {
        requestId,
        cached: false,
        usage: { embeddingTokens: 1, inputTokens: 1, outputTokens: 1 },
        costUsdEstimate: 0,
        latencyMs: { total: 5, firstToken: 4, generation: 1 },
      },
    },
  ];
  const body = events
    .map((event) => {
      const parsed = SseEvent.parse(event);
      return `event: ${parsed.event}\ndata: ${JSON.stringify(parsed.data)}\n\n`;
    })
    .join('');
  await page.route('**/api/ask', (route) =>
    route.fulfill({ contentType: 'text/event-stream', body }),
  );
}
