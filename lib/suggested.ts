import { getRuntimeCopy } from '@/lib/kit/copy-server';
import { normalize } from '@/lib/citations/normalize';

export const SUGGESTED = getRuntimeCopy().suggested;
export const SUGGESTED_IDS = SUGGESTED.map(({ id }) => id);
export type SuggestedId = string;
export function matchSuggested(question: string): SuggestedId | null {
  const normalized = normalize(question);
  return SUGGESTED.find((suggestion) => normalize(suggestion.question) === normalized)?.id ?? null;
}
