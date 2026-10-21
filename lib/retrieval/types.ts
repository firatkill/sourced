export type RetrievedChunk = {
  chunkId: string;
  documentTitle: string;
  documentUrl: string; // without anchor
  slug: string;
  anchor: string; // 'slug#ID'
  headingPath: string[];
  content: string;
  tokenCount: number;
  rrfScore: number;
  vectorRank: number | null; // 1-based, null if not in vector list
  ftsRank: number | null; // 1-based, null if not in FTS list
  vectorDistance: number | null;
  ftsScore: number | null;
};

export type Passage = RetrievedChunk & {
  label: `P${1 | 2 | 3 | 4 | 5 | 6}`;
  rerankPosition: number; // 1-based position after rerank
  officialUrl: string; // documentUrl + '#' + section id
};

export type RetrievalResult = {
  candidates: RetrievedChunk[]; // up to 20, RRF order
  reranked: RetrievedChunk[]; // up to 20, rerank order (or RRF on fallback)
  passages: Passage[]; // first 6 of reranked
  rerankFallback: boolean;
  rerankFallbackReason: 'timeout' | 'error' | 'invalid_output' | 'empty_output' | null;
  usage: { embeddingTokens: number; rerankInputTokens: number; rerankOutputTokens: number };
  timingsMs: { embed: number; search: number; rerank: number };
};
