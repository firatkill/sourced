// Corpus-specific UI copy (PRD §9.2–9.3, FR-74).
export const ASK_COPY = {
  docsLink: 'Read in the PostgreSQL docs',
  hero: 'Ask the PostgreSQL docs. Every claim shows its source.',
  lead: 'Answers come only from 35 pages of the PostgreSQL 17 documentation. Each citation is checked against the passage it points to before you see it.',
  notFoundHeading: 'I couldn’t find this in the PostgreSQL docs.',
  notFoundBody:
    'Sourced only answers from the 35 pages it has indexed. These passages came closest:',
  relatedReading: 'Related reading',
  anotherQuestion: 'Ask another question',
  tryAgain: 'Try again',
  notFoundAnnouncement: 'No answer found in the docs. Related reading is listed.',
  visitorLimitHeading: 'You’ve reached today’s limit',
  visitorLimitBody:
    'Each visitor can ask {limit} questions per day so the demo stays free to run. Your limit resets at {time} ({relative}).',
  suggestedStillWork: 'The suggested questions above still work.',
  globalLimitHeading: 'The demo has reached its daily limit',
  globalLimitBody:
    'Sourced answers up to {limit} questions a day across all visitors. It resets at {time} ({relative}). The suggested questions still work, and you can run Sourced yourself from the GitHub repository.',
  readonlyBanner:
    'Live answers are paused. The six suggested questions below were answered in advance and still work.',
  readonlyPlaceholder: 'Live answers are paused',
  offlineHeading: 'The demo is offline for maintenance',
  offlineBody: 'The evaluation results and the write-up are still available.',
  evaluationLink: 'See evaluation results',
  howItWorksLink: 'Read how it works',
  providerHeading: 'The language model didn’t respond',
  providerBody: 'This is usually temporary.',
  providerRefundedBody:
    'This is usually temporary. This question was not counted toward your daily limit.',
  networkHeading: 'Connection lost',
  networkBody: 'The answer stopped arriving. Check your connection and try again.',
  partialLabel: 'Partial answer, not verified',
  serverHeading: 'Something went wrong on our side',
  serverBody: 'The error has been logged with reference {requestId}. Try again in a minute.',
  stoppedLabel: 'Stopped. This partial answer was not verified.',
  stoppedAnnouncement: 'Stopped',
  disclosure: 'How this was answered',
  rankedCaption: 'Passages ranked for this answer',
  rankColumns: ['Passage', 'Vector rank', 'Keyword rank', 'RRF score', 'After rerank'],
  emptyRank: '—',
  reranked: 'Reranked by the language model.',
  rerankFallback: 'Reranker timed out; passages are in fused search order.',
  timings:
    'Retrieval {retrieval} ms · Rerank {rerank} ms · Generation {generation} s · Total {total} s',
  tokens: 'Tokens: {in} in, {out} out · Estimated cost ${cost}',
  cached:
    'This answer was generated in advance on {date} and served from the cache. No language model was called.',
  quoteFallback:
    'The model did not include supporting quotes, so they were extracted in a second call.',
  removedOne: '1 citation was removed because its quote was not found in the passage.',
  removedMany: '{n} citations were removed because their quotes were not found in the passages.',
  removedCitation: '{label} removed: {reason}.',
  removalReasons: {
    UNKNOWN_PASSAGE: 'it points to a passage that was not retrieved',
    NO_QUOTE: 'no supporting quote was given',
    QUOTE_TOO_SHORT: 'the quote was too short to check',
    QUOTE_TOO_LONG: 'the quote was too long',
    QUOTE_NOT_FOUND: 'the quote was not found in the passage',
  },
} as const;

export function formatAskCopy(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (placeholder: string, key: string) =>
    values[key] === undefined ? placeholder : String(values[key]),
  );
}

export function removedCitationsCopy(count: number): string {
  return count === 1 ? ASK_COPY.removedOne : formatAskCopy(ASK_COPY.removedMany, { n: count });
}
