const PUNCT_OR_SPACE = /[\p{P}\p{S}\p{Z}\s]/u;

/** Normalized text plus, for each output UTF-16 unit, the [start, end) range in the original string. */
export function normalizeWithMap(input: string): { text: string; map: Array<[number, number]> } {
  let text = '';
  const map: Array<[number, number]> = [];
  let lastWasSpace = true; // suppress leading space
  let i = 0;
  for (const cp of input) {
    // iterate by code point
    const start = i;
    const end = i + cp.length;
    i = end;
    const n = cp.normalize('NFKC').toLowerCase();
    for (const ch of n) {
      if (PUNCT_OR_SPACE.test(ch)) {
        if (!lastWasSpace) {
          text += ' ';
          map.push([start, end]);
          lastWasSpace = true;
        }
      } else {
        for (let k = 0; k < ch.length; k++) map.push([start, end]);
        text += ch;
        lastWasSpace = false;
      }
    }
  }
  if (text.endsWith(' ')) {
    text = text.slice(0, -1);
    map.pop();
  }
  return { text, map };
}

export const normalize = (s: string) => normalizeWithMap(s).text;
export const wordCount = (normalized: string) =>
  normalized === '' ? 0 : normalized.split(' ').length;
