import { describe, expect, it } from 'vitest';
import { normalize, normalizeWithMap, wordCount } from '@/lib/citations/normalize';

describe('TC-065 / UT-08 / FR-20: normative normalization', () => {
  it.each([
    ['ﬁ ＦＯＯ', 'fi foo'],
    ['“Repeatable Read” — isolation, level.', 'repeatable read isolation level'],
    ['pg_stat_user_tables', 'pg stat user tables'],
    [' \t A\n\r B   C $ + 😀 ', 'a b c'],
    ['', ''],
    ['— ! $', ''],
  ])('normalizes %j', (input, expected) => {
    expect(normalize(input)).toBe(expected);
  });

  it('maps NFKC expansions and astral UTF-16 units to original ranges', () => {
    expect(normalizeWithMap(' ﬁ!Ａ ')).toEqual({
      text: 'fi a',
      map: [
        [1, 2],
        [1, 2],
        [2, 3],
        [3, 4],
      ],
    });
    expect(normalizeWithMap('𐐀')).toEqual({
      text: '𐐨',
      map: [
        [0, 2],
        [0, 2],
      ],
    });
    const original = 'Before: “ﬁve ＷＯＲＤＳ — belong here”, after.';
    const { text, map } = normalizeWithMap(original);
    const quote = 'five words belong here';
    const pos = text.indexOf(quote);
    const span = original.slice(map[pos]![0], map[pos + quote.length - 1]![1]);
    expect(span).toBe('ﬁve ＷＯＲＤＳ — belong here');
    expect(normalize(span)).toBe(quote);
  });

  it('counts normalized words including empty input', () => {
    expect(wordCount('')).toBe(0);
    expect(wordCount(normalize('one_two—three four'))).toBe(4);
  });
});
