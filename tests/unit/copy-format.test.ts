import { describe, expect, it } from 'vitest';
import { formatCopy } from '@/lib/copy-format';
import { citations, passage } from '../fixtures/sse-streams';

describe('UT-28 / TC-093 — FR-07 plain-text copy', () => {
  it('rewrites markers and lists only cited sources once in label order', () => {
    const second = {
      ...passage,
      label: 'P2',
      documentTitle: 'Other',
      headingPath: ['Parent', 'Child'],
      officialUrl: 'https://www.postgresql.org/docs/17/other.html#section',
    };
    expect(
      formatCopy(
        {
          ...citations,
          answer: '**Answer** [P2] and [P1], again [P2].',
          valid: [
            { label: 'P2', quote: 'quote', quoteSpan: { start: 0, end: 5 } },
            ...citations.valid,
          ],
        },
        [second, { ...passage, label: 'P3' }, passage],
      ),
    ).toBe(
      'Answer [2] and [1], again [2].\n\nSources:\n[1] 11.8. Partial Indexes › 11.8. Partial Indexes — https://www.postgresql.org/docs/17/indexes-partial.html#INDEXES-PARTIAL\n[2] Other › Parent › Child — https://www.postgresql.org/docs/17/other.html#section',
    );
  });
  it('copies Markdown as text, preserving code and paragraph boundaries', () => {
    const result = formatCopy(
      {
        ...citations,
        answer:
          '*Emphasis* and [a link](https://example.com).\n\n`a_b`\n\n```sql\nSELECT 1;\n```\n\n- first\n- second\n\n[P1]',
      },
      [passage],
    );
    expect(result.split('\n\nSources:')[0]).toBe(
      'Emphasis and a link.\n\na_b\n\nSELECT 1;\n\nfirst\nsecond\n\n[1]',
    );
  });
});

it('TC-207 / FR-67: plain text citations copy a path and line without a file link', () => {
  const result = formatCopy(citations, [
    { ...passage, officialUrl: null, filePath: 'guide.txt', lineFrom: 12 },
  ]);
  expect(result).toContain('guide.txt, line 12');
  expect(result).not.toContain('file://');
});
