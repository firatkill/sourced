import { describe, expect, it, vi } from 'vitest';
import { GENERATION, RETRIEVAL } from '@/lib/config';
import { parseBlock, parseMarkers, removeMarkers } from '@/lib/citations/parse';
import { indexOfWholeWords, verifyCitations } from '@/lib/citations/verify';
import type { Passage } from '@/lib/retrieval/types';

const content = 'Before: “ﬁve ＷＯＲＤＳ — belong here”, after.';
const quote = 'five words belong here';
const passage: Passage = {
  label: 'P1',
  content,
  chunkId: '1',
  documentTitle: 'Docs',
  documentUrl: 'https://example.com',
  slug: 'docs',
  anchor: 'docs#section',
  headingPath: ['Docs'],
  tokenCount: 10,
  rrfScore: 1,
  vectorRank: 1,
  ftsRank: null,
  vectorDistance: 0,
  ftsScore: null,
  rerankPosition: 1,
  officialUrl: 'https://example.com#section',
};
const block = (entries: Array<[string, string]>) =>
  JSON.stringify({ citations: entries.map(([id, quote]) => ({ id, quote })) });
const fallback = () => vi.fn(() => Promise.resolve(new Map([['P1', quote]])));

describe('TC-066 / UT-09 / FR-18–FR-22: citation parsing', () => {
  it('canonicalizes groups and lowercase, retaining distinct offsets', () => {
    const parsed = parseMarkers('A [p1, P3; p2] [p1] [P99] [P100]');
    expect(parsed.answer).toBe('A [P1][P3][P2] [P1] [P99] [P100]');
    expect(parsed.markers.map(({ label }) => label)).toEqual(['P1', 'P3', 'P2', 'P1', 'P99']);
    for (const marker of parsed.markers)
      expect(parsed.answer.slice(marker.start, marker.end)).toBe(`[${marker.label}]`);
  });

  it.each([
    '`[p1, P2]` [P1]',
    '``[P1] ` [P2]`` [P1]',
    '```sql\n[P1]\n```\n[P1]',
    '~~~sql\n[P1]\n~~~\n[P1]',
    '````\n```\n[P1]\n````\n[P1]',
    '`unclosed [P1]',
  ])('ignores code and preserves offsets in %j', (answer) => {
    const parsed = parseMarkers(answer);
    expect(parsed.markers).toEqual([
      { label: 'P1', start: answer.lastIndexOf('[P1]'), end: answer.lastIndexOf('[P1]') + 4 },
    ]);
  });

  it('ignores unclosed fenced code and keeps code intact during removal', () => {
    expect(parseMarkers('```\n[P1]').markers).toEqual([]);
    expect(removeMarkers('`[P2]  .` A [p2, P1] .', new Set(['P2']))).toBe('`[P2]  .` A [P1].');
  });

  it.each(['', null, undefined, '{', '{}', '{"citations":[{"id":1,"quote":"x"}]}'])(
    'rejects missing or invalid blocks: %j',
    (input) => {
      expect(parseBlock(input)).toBeNull();
    },
  );

  it.each(['', '```json\n', '```\n'])(
    'parses blocks, uppercases ids and keeps the first duplicate (%j)',
    (fence) => {
      const json = block([
        ['p1', quote],
        ['P1', 'ignored'],
        ['P2', 'other'],
      ]);
      expect(parseBlock(fence ? `${fence}${json}\n\x60\x60\x60` : json)).toEqual(
        new Map([
          ['P1', quote],
          ['P2', 'other'],
        ]),
      );
      expect(parseBlock('{"citations":[]}')).toEqual(new Map());
    },
  );
});

describe('TC-066 / UT-09: verification', () => {
  it('verifies once per distinct label, ignores unused quotes and maps original spans', async () => {
    const call = fallback();
    const result = await verifyCitations(
      'A [p1, P1].',
      block([
        ['p1', quote],
        ['P2', 'unused'],
      ]),
      [passage],
      call,
    );
    expect(result).toEqual({
      answer: 'A [P1][P1].',
      notFound: false,
      valid: [{ label: 'P1', quote, quoteSpan: { start: 9, end: 32 } }],
      invalid: [],
      quoteFallbackUsed: false,
    });
    const span = result.valid[0]!.quoteSpan;
    expect(content.slice(span.start, span.end)).toBe('ﬁve ＷＯＲＤＳ — belong here');
    expect(call).not.toHaveBeenCalled();
  });

  it.each([
    ['P0', quote, 'UNKNOWN_PASSAGE'],
    [`P${String(RETRIEVAL.FINAL_PASSAGES + 1)}`, quote, 'UNKNOWN_PASSAGE'],
    ['P2', quote, 'UNKNOWN_PASSAGE'],
    ['P1', '', 'NO_QUOTE'],
    ['P1', 'one two three', 'QUOTE_TOO_SHORT'],
    ['P1', ' '.repeat(4), 'QUOTE_TOO_SHORT'],
    [
      'P1',
      Array.from({ length: GENERATION.QUOTE_MAX_WORDS + 1 }, () => 'word').join(' '),
      'QUOTE_TOO_LONG',
    ],
    ['P1', 'four words not present', 'QUOTE_NOT_FOUND'],
  ])('rejects %s with %s as %s', async (label, q, reason) => {
    const result = await verifyCitations(
      `A [${label}] [${label}].`,
      block([[label, q]]),
      [passage],
      fallback(),
    );
    expect(result).toMatchObject({
      answer: '',
      notFound: true,
      valid: [],
      invalid: [{ label, reason }],
      quoteFallbackUsed: false,
    });
  });

  it('removes invalid markers and repairs spacing without removing valid markers', async () => {
    const call = fallback();
    const result = await verifyCitations(
      'A [P1] [P2] . B [P2] , C [P2] ; D [P2] :',
      block([['P1', quote]]),
      [passage, { ...passage, label: 'P2' }],
      call,
    );
    expect(result.answer).toBe('A [P1]. B, C; D:');
    expect(result.invalid).toEqual([{ label: 'P2', reason: 'NO_QUOTE' }]);
    expect(call).not.toHaveBeenCalled();
  });

  it('matches whole words, searching past partial matches', () => {
    expect(indexOfWholeWords('prefix four words belong hereafter', 'four words belong here')).toBe(
      -1,
    );
    expect(
      indexOfWholeWords('xfour words belong here four words belong here', 'four words belong here'),
    ).toBe(24);
    expect(indexOfWholeWords('four words belong here next', 'four words belong here')).toBe(0);
  });

  it('accepts the maximum quote length', async () => {
    const q = Array.from({ length: GENERATION.QUOTE_MAX_WORDS }, () => 'word').join(' ');
    expect(
      (await verifyCitations('[P1]', block([['P1', q]]), [{ ...passage, content: q }], fallback()))
        .notFound,
    ).toBe(false);
  });

  it.each([null, '', '{', '{}'])(
    'uses fallback once for missing/invalid block %j',
    async (input) => {
      const call = fallback();
      const result = await verifyCitations('A [p1, P2] [P1].', input, [passage], call);
      expect(call).toHaveBeenCalledExactlyOnceWith('A [P1][P2] [P1].', [passage], ['P1', 'P2']);
      expect(result.quoteFallbackUsed).toBe(true);
      expect(result.notFound).toBe(false);
    },
  );

  it('treats failed fallback (empty map) as missing quotes', async () => {
    const result = await verifyCitations('[P1]', null, [passage], () =>
      Promise.resolve(new Map<string, string>()),
    );
    expect(result).toMatchObject({
      notFound: true,
      quoteFallbackUsed: true,
      invalid: [{ label: 'P1', reason: 'NO_QUOTE' }],
    });
  });

  it.each([
    GENERATION.NOT_FOUND_SENTENCE,
    GENERATION.NOT_FOUND_SENTENCE.replace("'", '’'),
    'An uncited answer.',
    '`[P1]`',
  ])('returns not found without fallback for %j', async (answer) => {
    const call = fallback();
    expect(await verifyCitations(answer, null, [passage], call)).toEqual({
      answer: '',
      notFound: true,
      valid: [],
      invalid: [],
      quoteFallbackUsed: false,
    });
    expect(call).not.toHaveBeenCalled();
  });
});
