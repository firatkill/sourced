import type { SseEvent } from '@/lib/sse/events';

// TRD §12.2 example, with the abbreviated UUID and passage text expanded.
export const passage = {
  label: 'P1',
  chunkId: '812',
  documentTitle: '11.8. Partial Indexes',
  headingPath: ['11.8. Partial Indexes'],
  officialUrl: 'https://www.postgresql.org/docs/17/indexes-partial.html#INDEXES-PARTIAL',
  snippet: 'A partial index is an index built over a subset of a table.',
  content: 'A partial index is an index built over a subset of a table.',
  scores: { rrf: 0.0323, vectorRank: 1, ftsRank: 2, rerankPosition: 1 },
};
const requestId = '5b0e0000-0000-4000-8000-000000000000';
export const meta = {
  requestId,
  cached: false,
  cachedAt: null,
  passages: [passage],
  retrieval: {
    vectorCandidates: 40,
    ftsCandidates: 17,
    rerankFallback: false,
    rerankFallbackReason: null,
    timingsMs: { embed: 212, search: 38, rerank: 1180 },
  },
};
export const citations = {
  answer: 'A partial index covers only the rows that satisfy its predicate [P1].',
  notFound: false,
  valid: [
    {
      label: 'P1',
      quote: 'a partial index is an index built over a subset of a table',
      quoteSpan: { start: 0, end: 58 },
    },
  ],
  invalid: [],
  quoteFallbackUsed: false,
};
export const done = {
  requestId,
  cached: false,
  usage: { embeddingTokens: 9, inputTokens: 8120, outputTokens: 402 },
  costUsdEstimate: 0.0016,
  latencyMs: { total: 5230, firstToken: 2310, generation: 3640 },
};
export const error = {
  requestId,
  code: 'PROVIDER_ERROR' as const,
  message: 'The language model did not respond.',
  retryable: true,
  refunded: true,
};
export const eventExamples: SseEvent[] = [
  { event: 'meta', data: meta },
  { event: 'token', data: { delta: 'A partial index covers only the rows' } },
  { event: 'citations', data: citations },
  { event: 'done', data: done },
  { event: 'error', data: error },
];

// Wire fixtures are independent of encodeEvent so encoder/parser bugs cannot cancel out.
export const streams = [
  {
    name: 'ordered answer and heartbeat',
    wire: 'event: meta\ndata: {"cached":false}\n\n: ping\n\nevent: token\ndata: {"delta":"İndex 🌱\\nrow"}\n\nevent: citations\ndata: {}\n\nevent: done\ndata: {}\n\n',
    expected: [
      { event: 'meta', data: '{"cached":false}' },
      { event: 'token', data: '{"delta":"İndex 🌱\\nrow"}' },
      { event: 'citations', data: '{}' },
      { event: 'done', data: '{}' },
    ],
  },
  {
    name: 'comments, ignored fields, multi-line data and default event',
    wire: ': ping\n\nevent: token\nid: 5\nretry: 100\nunknown\ndata: first\ndata:  second\n\ndata\n\nevent: unused\n\ndata:last\n\n',
    expected: [
      { event: 'token', data: 'first\n second' },
      { event: 'message', data: '' },
      { event: 'message', data: 'last' },
    ],
  },
  {
    name: 'terminal error without final newline',
    wire: 'event: error\ndata: {"message":"Search failed."}',
    expected: [{ event: 'error', data: '{"message":"Search failed."}' }],
  },
  {
    name: 'missing final blank line',
    wire: 'event: token\ndata: final\n',
    expected: [{ event: 'token', data: 'final' }],
  },
];
