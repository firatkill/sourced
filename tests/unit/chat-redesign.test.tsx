// @vitest-environment jsdom
// REDESIGN §3–§5, §7–§8: real useAsk, contract-validated local streams, no API calls.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AskApp } from '@/components/ask/AskApp';
import { Turn } from '@/components/ask/Turn';
import { AnswerView } from '@/components/ask/AnswerView';
import { quoteSegments } from '@/components/ask/PassageCard';
import { SseEvent } from '@/lib/sse/events';
import { ASK_COPY } from '@/lib/copy';
import { SUGGESTED } from '@/lib/suggested';
import { meta, citations, done } from '../fixtures/sse-streams';

const noop = () => undefined;
const limits = { ipDaily: 3, globalDaily: 300 };
function stream() {
  return new Response(
    [
      { event: 'meta', data: meta },
      { event: 'token', data: { delta: citations.answer } },
      { event: 'citations', data: citations },
      { event: 'done', data: done },
    ]
      .map((event) => {
        const parsed = SseEvent.parse(event);
        return `event: ${parsed.event}\ndata: ${JSON.stringify(parsed.data)}\n\n`;
      })
      .join(''),
    { headers: { 'Content-Type': 'text/event-stream' } },
  );
}
beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it('keeps independent turns after validation, submits no history, clears with New chat', async () => {
  const fetch = vi.fn(() => Promise.resolve(stream()));
  vi.stubGlobal('fetch', fetch);
  render(<AskApp demoMode="on" limits={limits} suggested={SUGGESTED} copy={ASK_COPY} />);
  const submit = async (question: string) => {
    fireEvent.change(screen.getByRole('textbox'), { target: { value: question } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    await waitFor(() => {
      expect(document.querySelector('[data-ask-status]')?.textContent).toBe(
        'Answer ready with 1 verified source.',
      );
    });
  };
  await submit('How do partial indexes work?');
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'x' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
  expect(screen.getByRole('alert').textContent).toBe(
    'That’s too short to search for. Try a full question.',
  );
  expect(screen.getAllByRole('article', { name: 'Answer' })).toHaveLength(1);
  await submit('When should I create an index?');
  expect(screen.getAllByRole('article', { name: 'Answer' })).toHaveLength(2);
  expect(fetch).toHaveBeenCalledTimes(2);
  for (const [index, question] of [
    'How do partial indexes work?',
    'When should I create an index?',
  ].entries()) {
    expect(fetch.mock.calls[index]).toEqual([
      '/api/ask',
      expect.objectContaining({ body: JSON.stringify({ question }) }),
    ]);
  }
  expect(
    within(screen.getByRole('region', { name: 'This session' }))
      .getAllByRole('button')
      .map((el) => el.textContent),
  ).toEqual(['How do partial indexes work?', 'When should I create an index?']);
  fireEvent.click(
    within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', {
      name: 'New chat',
    }),
  );
  expect(screen.queryAllByRole('article', { name: 'Answer' })).toHaveLength(0);
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Ask the PostgreSQL docs.');
  expect(screen.getByRole<HTMLTextAreaElement>('textbox').value).toBe('');
});

it('blocks concurrent submissions and New chat until Stop', () => {
  const fetch = vi.fn(() => new Promise<Response>(() => undefined));
  vi.stubGlobal('fetch', fetch);
  render(<AskApp demoMode="on" limits={limits} suggested={SUGGESTED} copy={ASK_COPY} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'How do indexes work?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
  for (const control of screen.getAllByRole<HTMLButtonElement>('button', { name: 'New chat' }))
    expect(control.disabled).toBe(true);
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
  expect(fetch).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
  expect(screen.getByText('Stopped. This partial answer was not verified.')).toBeTruthy();
  for (const control of screen.getAllByRole<HTMLButtonElement>('button', { name: 'New chat' }))
    expect(control.disabled).toBe(false);
});

for (const cached of [false, true]) {
  for (const fallback of [false, true]) {
    it(`summary uses SSE fields only: cached=${String(cached)}, fallback=${String(fallback)}`, () => {
      render(
        <Turn
          turn={{
            id: 1,
            question: 'Question',
            citations,
            phase: {
              kind: 'done',
              question: 'Question',
              citations,
              done,
              meta: { ...meta, cached, retrieval: { ...meta.retrieval, rerankFallback: fallback } },
            },
          }}
          limits={limits}
          selected={null}
          onSelect={noop}
          onRetry={noop}
          onAnother={noop}
          onStop={noop}
        />,
      );
      expect(
        screen.getByText(
          cached
            ? 'Answered in advance · served from the cache'
            : `40 + 17 candidates · 1 passages read · 5.2 s${fallback ? ' · search order' : ''}`,
        ),
      ).toBeTruthy();
      expect(screen.getByText('1 of 1 citation checked against the docs')).toBeTruthy();
    });
  }
}

describe('verified UTF-16 quote segments (§3.3)', () => {
  const content = '😀 one two three four';
  const span = (start: number, end: number) => ({
    label: 'P1',
    quote: '',
    quoteSpan: { start, end },
  });
  it('sorts and merges overlap without duplicating text or mutating input', () => {
    const input = [span(7, 15), span(3, 10), span(17, 21)];
    const result = quoteSegments(content, input);
    expect(result.map((s) => s.text).join('')).toBe(content);
    expect(result.filter((s) => s.marked).map((s) => s.text)).toEqual(['one two thre', 'four']);
    expect(input[0]?.quoteSpan).toEqual({ start: 7, end: 15 });
  });
  it('ignores invalid, reversed, fractional and out-of-bounds spans', () => {
    expect(quoteSegments(content, [span(-1, 3), span(5, 2), span(1.5, 3), span(0, 100)])).toEqual([
      { text: content, marked: false, start: 0 },
    ]);
    expect(quoteSegments('', [])).toEqual([]);
  });
});

it.each(['sql', 'psql', 'pgsql', 'postgresql', ''])(
  'SQL fence %s preserves text and renders tokens as spans',
  (language) => {
    const source = "SELECT 'hello', 42; -- comment\n";
    const { container } = render(
      <AnswerView
        text={`\`\`\`${language}\n${source}\`\`\``}
        passages={[]}
        citations={null}
        onSelect={noop}
      />,
    );
    expect(container.querySelector('figure figcaption')?.textContent).toContain('SQL');
    expect(container.querySelector('pre code')?.textContent).toBe(source);
    expect(container.querySelector('[data-sql-token="keyword"]')?.textContent).toBe('SELECT');
    expect(container.querySelector('[data-sql-token="string"]')?.textContent).toBe("'hello'");
    expect(container.querySelector('[data-sql-token="number"]')?.textContent).toBe('42');
  },
);
it('other languages remain plain text and inline code is not a figure', () => {
  const { container } = render(
    <AnswerView
      text={'`SELECT`\n\n```python\nprint("hello")\n```'}
      passages={[]}
      citations={null}
      onSelect={noop}
    />,
  );
  expect(container.querySelectorAll('figure')).toHaveLength(1);
  expect(container.querySelector('figcaption')?.textContent).toContain('PYTHON');
  expect(container.querySelector('[data-sql-token]')).toBeNull();
  expect(container.querySelector('p code')?.textContent).toBe('SELECT');
});
it('Copy code copies the source, announces success, and resets at exactly two seconds', async () => {
  vi.useFakeTimers();
  const writeText = vi.fn(() => Promise.resolve());
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  render(
    <AnswerView text={'```sql\nSELECT 1;\n```'} passages={[]} citations={null} onSelect={noop} />,
  );
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }));
    await Promise.resolve();
  });
  expect(writeText).toHaveBeenCalledWith('SELECT 1;\n');
  expect(screen.getByRole('status').textContent).toBe('Code copied');
  act(() => {
    vi.advanceTimersByTime(1999);
  });
  expect(screen.getByRole('button', { name: 'Copy code' }).textContent).toBe('Copied');
  act(() => {
    vi.advanceTimersByTime(1);
  });
  expect(screen.getByRole('button', { name: 'Copy code' }).textContent).toBe('Copy');
  expect(screen.getByRole('status').textContent).toBe('');
});

it('keeps the desktop opener chip mounted and restores focus after Escape inside the aside', async () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(stream())),
  );
  render(<AskApp demoMode="on" limits={limits} suggested={SUGGESTED} copy={ASK_COPY} />);
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: 'How do partial indexes work?' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
  const chip = await screen.findByRole('button', { name: /^Source P1:/ });
  chip.focus();
  fireEvent.click(chip);
  const viewer = screen.getByRole('complementary', { name: 'Source viewer' });
  expect(document.activeElement).toBe(viewer);
  expect(chip.isConnected).toBe(true);
  expect(screen.getByRole('button', { name: /^Source P1:/ })).toBe(chip);
  const close = within(viewer).getByRole('button', { name: 'Close source viewer' });
  close.focus();
  fireEvent.keyDown(close, { key: 'Escape' });
  await waitFor(() => {
    expect(document.activeElement).toBe(chip);
  });
  expect(screen.queryByRole('complementary', { name: 'Source viewer' })).toBeNull();
  expect(chip.isConnected).toBe(true);
});

it('exposes the page footer outside navigation and both FR-48 privacy links', () => {
  render(<AskApp demoMode="on" limits={limits} suggested={SUGGESTED} copy={ASK_COPY} />);
  const footer = screen.getByRole('contentinfo');
  expect(footer.closest('nav')).toBeNull();
  expect([...footer.querySelectorAll('p')].map((p) => p.textContent)).toEqual([
    'Built by Fırat Kıl · firatkil.com · Source on GitHub (MIT)',
    'Answers are generated from the PostgreSQL 17 documentation, © The PostgreSQL Global Development Group, used under the PostgreSQL License.',
    'Privacy: questions are not stored. Read how this works.',
  ]);
  expect(
    within(footer).getByRole('link', { name: 'Read how this works.' }).getAttribute('href'),
  ).toBe('/how-it-works#privacy');
  const inputLink = screen.getByRole('link', { name: 'not stored' });
  expect(inputLink.getAttribute('href')).toBe('/how-it-works#privacy');
  expect(inputLink.closest('#question-helper')).not.toBeNull();
});
