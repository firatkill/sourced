import { normalize } from '@/lib/citations/normalize';

export const SUGGESTED = [
  { id: 'iso', question: 'What is the difference between REPEATABLE READ and SERIALIZABLE?' },
  { id: 'partial', question: 'When should I use a partial index?' },
  { id: 'explain', question: 'How do I read the output of EXPLAIN ANALYZE?' },
  { id: 'jsonb', question: 'Should I store JSON as json or jsonb?' },
  { id: 'rls', question: 'How does row-level security decide which rows a user can see?' },
  { id: 'wraparound', question: 'Why does VACUUM matter, and what is transaction ID wraparound?' },
] as const;
export const SUGGESTED_IDS = ['iso', 'partial', 'explain', 'jsonb', 'rls', 'wraparound'] as const;
export type SuggestedId = (typeof SUGGESTED_IDS)[number];
export function matchSuggested(question: string): SuggestedId | null {
  const normalized = normalize(question);
  return SUGGESTED.find((suggestion) => normalize(suggestion.question) === normalized)?.id ?? null;
}
