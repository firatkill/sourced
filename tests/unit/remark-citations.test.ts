// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import Markdown from 'react-markdown';
import { remarkCitations } from '@/lib/markdown/remark-citations';
import { AnswerView } from '@/components/ask/AnswerView';
import { PassageCard } from '@/components/ask/PassageCard';
import { passage, citations } from '../fixtures/sse-streams';

afterEach(cleanup);

describe('UT-21 / TC-094 — text citations only (FR-05, TRD §15.5)', () => {
  it('splits adjacent and nested P1–P6 markers, leaves other labels and code unchanged', () => {
    const { container } = render(
      createElement(
        Markdown,
        { remarkPlugins: [remarkCitations] },
        '[P1][P2] **[P3]** *[P4]*\n\n- [P5]\n- [P6]\n\n[P0] [P7] [P10] `code [P1]`\n\n```sql\n[P2]\n```',
      ),
    );
    expect(
      [...container.querySelectorAll('[data-citation]')].map((node) => node.textContent),
    ).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6']);
    expect(container.querySelectorAll('code')[0]?.textContent).toBe('code [P1]');
    expect(container.querySelectorAll('code')[1]?.textContent).toBe('[P2]\n');
    expect(container.textContent).toContain('[P0] [P7] [P10]');
  });

  it('renders neutral draft chips, then only verified buttons from the replacement answer', () => {
    const props = { text: 'Draft [P1] [P2]', passages: [passage], onSelect: () => undefined };
    const view = render(createElement(AnswerView, { ...props, citations: null }));
    expect(view.container.querySelector('button')).toBeNull();
    expect(view.container.textContent).toBe('Draft P1 P2');
    view.rerender(createElement(AnswerView, { ...props, citations }));
    expect(
      view.getByRole('button', { name: 'Source P1: 11.8. Partial Indexes, 11.8. Partial Indexes' }),
    ).toBeTruthy();
    expect(view.container.textContent).not.toContain('Draft');
    expect(view.container.textContent).not.toContain('P2');
  });

  it('omits raw HTML and renders model links as text (TC-095, NFR-14)', () => {
    const { container } = render(
      createElement(AnswerView, {
        text: '<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[docs](https://example.com) **safe**',
        passages: [],
        citations: null,
        onSelect: () => undefined,
      }),
    );
    expect(container.querySelector('script, img, a')).toBeNull();
    expect(container.querySelector('p')?.textContent).toBe('docs safe');
    expect(container.querySelector('strong')?.textContent).toBe('safe');
  });
});

describe('TC-092 — quote spans (FR-06, TRD §12.2, §15.5)', () => {
  const content = '😀 Preface.\n\nA supporting quote here.\n\nLast paragraph.';
  const start = content.indexOf('supporting');
  const end = start + 'supporting quote'.length;
  it('uses UTF-16 offsets across paragraphs and escapes passage HTML', () => {
    const { container } = render(
      createElement(PassageCard, {
        passage: { ...passage, content: `${content}<img src=x>` },
        citation: { label: 'P1', quote: 'supporting quote', quoteSpan: { start, end } },
        selected: false,
        verified: true,
      }),
    );
    expect(container.querySelector('mark')?.textContent).toBe('supporting quote');
    expect(container.querySelector('mark')?.getAttribute('aria-description')).toBe(
      'Supporting quote',
    );
    expect(container.querySelectorAll('article > p')).toHaveLength(3);
    expect(container.querySelector('img')).toBeNull();
  });
  it.each([
    { start: -1, end },
    { start: end, end: start },
    { start, end: 1000 },
    { start: 0.5, end },
  ])('does not highlight an invalid span %j', (quoteSpan) => {
    const { container } = render(
      createElement(PassageCard, {
        passage: { ...passage, content },
        citation: { label: 'P1', quote: '', quoteSpan },
        selected: false,
        verified: true,
      }),
    );
    expect(container.querySelector('mark')).toBeNull();
  });
});
