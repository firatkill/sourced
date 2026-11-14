import { getCopy } from '@/lib/kit/copy';
import { getKitConfig } from '@/lib/kit/runtime-config';
import { GENERATION, RETRIEVAL } from '@/lib/config';
import type { Passage } from '@/lib/retrieval/types';
import { normalize, normalizeWithMap, wordCount } from './normalize';
import { parseBlock, parseMarkers, removeMarkers } from './parse';

export type InvalidReason =
  'UNKNOWN_PASSAGE' | 'NO_QUOTE' | 'QUOTE_TOO_SHORT' | 'QUOTE_TOO_LONG' | 'QUOTE_NOT_FOUND';

export type VerificationResult = {
  answer: string;
  notFound: boolean;
  valid: Array<{ label: string; quote: string; quoteSpan: { start: number; end: number } }>;
  invalid: Array<{ label: string; reason: InvalidReason }>;
  quoteFallbackUsed: boolean;
};

export type QuoteFallback = (
  answer: string,
  passages: readonly Passage[],
  cited: readonly string[],
) => Promise<Map<string, string>>;

export function isNotFoundAnswer(answer: string): boolean {
  return normalize(answer) === normalize(getCopy(getKitConfig()).notFound);
}

export function indexOfWholeWords(text: string, quote: string): number {
  for (let pos = text.indexOf(quote); pos >= 0; pos = text.indexOf(quote, pos + 1)) {
    const end = pos + quote.length;
    if ((pos === 0 || text[pos - 1] === ' ') && (end === text.length || text[end] === ' '))
      return pos;
  }
  return -1;
}

export async function verifyCitations(
  answer: string,
  block: string | null | undefined,
  passages: readonly Passage[],
  fallback: QuoteFallback,
): Promise<VerificationResult> {
  const parsed = parseMarkers(answer);
  const cited = [...new Set(parsed.markers.map(({ label }) => label))];
  if (isNotFoundAnswer(answer)) {
    return { answer: '', notFound: true, valid: [], invalid: [], quoteFallbackUsed: false };
  }
  let quotes = parseBlock(block);
  let quoteFallbackUsed = false;
  if (quotes === null && cited.length > 0) {
    quotes = await fallback(parsed.answer, passages, cited);
    quoteFallbackUsed = true;
  }
  const valid: VerificationResult['valid'] = [];
  const invalid: VerificationResult['invalid'] = [];
  for (const label of cited) {
    const n = Number(label.slice(1));
    const passage = passages[n - 1];
    if (
      n < 1 ||
      n > (getKitConfig().overrides.retrieval.finalPassages ?? RETRIEVAL.FINAL_PASSAGES) ||
      !passage
    ) {
      invalid.push({ label, reason: 'UNKNOWN_PASSAGE' });
      continue;
    }
    const q = quotes?.get(label);
    if (!q) {
      invalid.push({ label, reason: 'NO_QUOTE' });
      continue;
    }
    const nq = normalize(q);
    if (wordCount(nq) < GENERATION.QUOTE_MIN_WORDS) {
      invalid.push({ label, reason: 'QUOTE_TOO_SHORT' });
      continue;
    }
    if (wordCount(nq) > GENERATION.QUOTE_MAX_WORDS) {
      invalid.push({ label, reason: 'QUOTE_TOO_LONG' });
      continue;
    }
    const { text: np, map } = normalizeWithMap(passage.content);
    const pos = indexOfWholeWords(np, nq);
    const start = map[pos];
    const end = map[pos + nq.length - 1];
    if (pos < 0 || !start || !end) {
      invalid.push({ label, reason: 'QUOTE_NOT_FOUND' });
      continue;
    }
    valid.push({ label, quote: q, quoteSpan: { start: start[0], end: end[1] } });
  }
  const invalidLabels = new Set(invalid.map(({ label }) => label));
  const cleaned = removeMarkers(answer, invalidLabels);
  const notFound = valid.length === 0;
  return { answer: notFound ? '' : cleaned, notFound, valid, invalid, quoteFallbackUsed };
}
