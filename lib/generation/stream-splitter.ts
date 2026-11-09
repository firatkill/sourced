import { GENERATION } from '@/lib/config';

export function createCitationSplitter(delimiter = GENERATION.CITATIONS_DELIMITER) {
  let pending = ''; // text not yet emitted, may contain a delimiter prefix
  let inBlock = false;
  let answer = '';
  let block = '';

  function longestDelimiterPrefixSuffix(s: string): number {
    const max = Math.min(s.length, delimiter.length - 1);
    for (let n = max; n > 0; n--) if (delimiter.startsWith(s.slice(-n))) return n;
    return 0;
  }

  return {
    /** Returns the text safe to emit now. */
    push(delta: string): string {
      if (inBlock) {
        block += delta;
        return '';
      }
      pending += delta;
      const idx = pending.indexOf(delimiter);
      if (idx !== -1) {
        const out = pending.slice(0, idx);
        block = pending.slice(idx + delimiter.length);
        inBlock = true;
        pending = '';
        answer += out;
        return out;
      }
      const hold = longestDelimiterPrefixSuffix(pending);
      const out = pending.slice(0, pending.length - hold);
      pending = pending.slice(pending.length - hold);
      answer += out;
      return out;
    },
    /** Call once when the model stream ends. Returns the final text to emit (if any). */
    end(): { flush: string; answer: string; block: string | null } {
      const flush = inBlock ? '' : pending;
      answer += flush;
      return { flush, answer: answer.trimEnd(), block: inBlock ? block.trim() : null };
    },
  };
}
