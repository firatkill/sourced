// @vitest-environment jsdom
// T-33: component coverage of TC-096–TC-106; browser E2E cases follow in T-34.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AskApp } from '@/components/ask/AskApp';
import { HowAnswered } from '@/components/ask/HowAnswered';
import { rateLimitCopy } from '@/components/ask/states/RateLimited';
import { useAsk, isInFlight, askStatus, type Phase } from '@/hooks/useAsk';
import { meta, citations, done, passage } from '../fixtures/sse-streams';
import { ASK_COPY } from '@/lib/copy';

vi.mock('@/hooks/useAsk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useAsk')>()),
  useAsk: vi.fn(),
}));
const question = 'How do partial indexes work?';
const limits = { ipDaily: 3, globalDaily: 300 };
const suggested = [{ id: 'partial' as const, question: 'When should I use a partial index?' }];
function show(phase: Phase, demoMode: 'on' | 'readonly' | 'off' = 'on') {
  const submit = vi.fn(async () => {});
  const askAnother = vi.fn();
  vi.mocked(useAsk).mockReturnValue({
    phase,
    question,
    citations: phase.kind === 'done' ? phase.citations : null,
    inputRef: { current: null },
    setQuestion: vi.fn(),
    submit,
    stop: vi.fn(),
    askAnother,
    inFlight: isInFlight(phase),
    status: askStatus(phase),
  });
  return {
    ...render(<AskApp demoMode={demoMode} limits={limits} suggested={suggested} copy={ASK_COPY} />),
    submit,
    askAnother,
  };
}
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('T-33 / PRD §9.2 disclosure (TC-096, TC-098, TC-099, TC-106)', () => {
  it('starts collapsed, expands with an accessible trigger and shows ranks and exact live metrics', () => {
    render(
      <HowAnswered
        meta={{
          ...meta,
          passages: [
            { ...passage, scores: { ...passage.scores, vectorRank: null, ftsRank: null } },
          ],
        }}
        done={done}
        citations={citations}
      />,
    );
    const trigger = screen.getByRole('button', { name: 'How this was answered' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('table')).toBeNull();
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('table', { name: 'Passages ranked for this answer' })).toBeTruthy();
    expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Passage',
      'Vector rank',
      'Keyword rank',
      'RRF score',
      'After rerank',
    ]);
    expect(screen.getAllByRole('cell').map((cell) => cell.textContent)).toEqual([
      '—',
      '—',
      '0.0323',
      '1',
    ]);
    expect(screen.getByText('Reranked by the language model.')).toBeTruthy();
    expect(
      screen.getByText('Retrieval 250 ms · Rerank 1180 ms · Generation 3.6 s · Total 5.2 s'),
    ).toBeTruthy();
    expect(screen.getByText('Tokens: 8120 in, 402 out · Estimated cost $0.0016')).toBeTruthy();
    fireEvent.click(trigger);
    expect(screen.queryByRole('table')).toBeNull();
  });
  it.each(['timeout', 'error', 'invalid_output', 'empty_output'] as const)(
    'D-24 uses fallback copy for %s',
    (reason) => {
      render(
        <HowAnswered
          meta={{
            ...meta,
            retrieval: { ...meta.retrieval, rerankFallback: true, rerankFallbackReason: reason },
          }}
          done={done}
          citations={citations}
        />,
      );
      fireEvent.click(screen.getByRole('button'));
      expect(
        screen.getByText('Reranker timed out; passages are in fused search order.'),
      ).toBeTruthy();
    },
  );
  it('TC-099 / D-81 shows quote fallback and every individual removal reason', () => {
    const reasons = [
      'UNKNOWN_PASSAGE',
      'NO_QUOTE',
      'QUOTE_TOO_SHORT',
      'QUOTE_TOO_LONG',
      'QUOTE_NOT_FOUND',
    ] as const;
    render(
      <HowAnswered
        meta={meta}
        done={done}
        citations={{
          ...citations,
          quoteFallbackUsed: true,
          invalid: reasons.map((reason, i) => ({ label: `P${String(i + 1)}`, reason })),
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(
      screen.getByText(
        'The model did not include supporting quotes, so they were extracted in a second call.',
      ),
    ).toBeTruthy();
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'P1 removed: it points to a passage that was not retrieved.',
      'P2 removed: no supporting quote was given.',
      'P3 removed: the quote was too short to check.',
      'P4 removed: the quote was too long.',
      'P5 removed: the quote was not found in the passage.',
    ]);
  });
  it.each([1, 2])(
    'TC-098 shows the %i-citation note under the answer and in the disclosure',
    (n) => {
      show({
        kind: 'done',
        question,
        meta,
        done,
        citations: {
          ...citations,
          invalid: Array.from({ length: n }, (_, i) => ({
            label: `P${String(i + 2)}`,
            reason: 'QUOTE_NOT_FOUND' as const,
          })),
        },
      });
      const expected =
        n === 1
          ? '1 citation was removed because its quote was not found in the passage.'
          : '2 citations were removed because their quotes were not found in the passages.';
      expect(screen.getAllByText(expected)).toHaveLength(1);
      fireEvent.click(screen.getByRole('button', { name: 'How this was answered' }));
      expect(screen.getAllByText(expected)).toHaveLength(2);
    },
  );
  it('TC-106 replaces timings and tokens with the cached date, retaining ranks and reranker copy', () => {
    show({
      kind: 'done',
      question,
      meta: { ...meta, cached: true, cachedAt: '2026-11-08T12:00:00Z' },
      done: { ...done, cached: true },
      citations,
    });
    expect(screen.getByText('Answered in advance')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'How this was answered' }));
    expect(
      screen.getByText(
        'This answer was generated in advance on Nov 8, 2026 and served from the cache. No language model was called.',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getByText('Reranked by the language model.')).toBeTruthy();
    expect(screen.queryByText(/^Retrieval \d/)).toBeNull();
    expect(screen.queryByText(/^Tokens:/)).toBeNull();
  });
});

describe('T-33 / PRD §9.3 non-happy states (TC-097, TC-100–TC-105)', () => {
  it('TC-097 hides the draft and shows related reading without highlights', () => {
    const { container, askAnother } = show({ kind: 'notFound', question, meta, done });
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'I couldn’t find this in the PostgreSQL docs.',
      }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Sourced only answers from the 35 pages it has indexed. These passages came closest:',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Related reading' })).toBeTruthy();
    expect(screen.getByText(passage.content)).toBeTruthy();
    expect(container.querySelector('mark')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Sources' })).toBeNull();
    expect(screen.queryByText(citations.answer)).toBeNull();
    expect(screen.getByRole('status').textContent).toBe(
      'No answer found in the docs. Related reading is listed.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ask another question' }));
    expect(askAnother).toHaveBeenCalledOnce();
  });
  it.each(['ip', 'global'] as const)(
    'TC-100/101 shows %s quota, local reset time and announces the full copy',
    (scope) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-11-09T19:00:00Z'));
      show({ kind: 'rateLimited', scope, resetAt: '2026-11-10T00:00:00Z' });
      const time = new Intl.DateTimeFormat(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date('2026-11-10T00:00:00Z'));
      const heading =
        scope === 'ip' ? 'You’ve reached today’s limit' : 'The demo has reached its daily limit';
      const body =
        scope === 'ip'
          ? `Each visitor can ask 3 questions per day so the demo stays free to run. Your limit resets at ${time} (in 5 hours).`
          : `Sourced answers up to 300 questions a day across all visitors. It resets at ${time} (in 5 hours). The suggested questions still work, and you can run Sourced yourself from the GitHub repository.`;
      expect(screen.getByRole('heading', { name: heading })).toBeTruthy();
      expect(screen.getByText(body)).toBeTruthy();
      expect(screen.getByRole('status').textContent).toBe(`${heading}. ${body}`);
      expect(document.activeElement).toBe(screen.getByRole('textbox'));
      expect(
        screen.getByRole<HTMLButtonElement>('button', { name: suggested[0]!.question }).disabled,
      ).toBe(false);
      if (scope === 'ip')
        expect(screen.getByText('The suggested questions above still work.')).toBeTruthy();
    },
  );
  it('D-24 reset time uses minutes under an hour', () => {
    expect(
      rateLimitCopy('ip', '2026-11-10T00:00:00Z', limits, Date.parse('2026-11-09T23:35:00Z')).body,
    ).toContain('(in 25 minutes).');
  });
  it.each(['on', 'readonly'] as const)(
    'TC-102 readonly from %s initial mode disables input, enables chips and shows status banner',
    (mode) => {
      show({ kind: 'readonly' }, mode);
      expect(
        screen
          .getByText(
            'Live answers are paused. The six suggested questions below were answered in advance and still work.',
          )
          .getAttribute('role'),
      ).toBe('status');
      const input = screen.getByRole<HTMLTextAreaElement>('textbox');
      expect(input.disabled).toBe(true);
      expect(input.placeholder).toBe('Live answers are paused');
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Ask' }).disabled).toBe(true);
      expect(
        screen.getByRole<HTMLButtonElement>('button', { name: suggested[0]!.question }).disabled,
      ).toBe(false);
    },
  );
  it.each(['on', 'off'] as const)(
    'TC-102 off from %s initial mode replaces form and chips with links',
    (mode) => {
      show({ kind: 'demoOff' }, mode);
      expect(
        screen.getByRole('heading', { name: 'The demo is offline for maintenance' }),
      ).toBeTruthy();
      expect(
        screen.getByText('The evaluation results and the write-up are still available.'),
      ).toBeTruthy();
      expect(
        screen.getByRole('link', { name: 'See evaluation results' }).getAttribute('href'),
      ).toBe('/eval');
      expect(screen.getByRole('link', { name: 'Read how it works' }).getAttribute('href')).toBe(
        '/how-it-works',
      );
      expect(screen.queryByRole('textbox')).toBeNull();
      expect(screen.queryByRole('button', { name: suggested[0]!.question })).toBeNull();
    },
  );
  it.each([true, false])(
    'TC-103 provider error refunded=%s focuses retry and resubmits the same question',
    (refunded) => {
      const { submit } = show({
        kind: 'providerError',
        question: 'Original question',
        refunded,
        requestId: done.requestId,
      });
      expect(
        screen.getByRole('heading', { name: 'The language model didn’t respond' }),
      ).toBeTruthy();
      expect(
        screen.getByText(
          refunded
            ? 'This is usually temporary. This question was not counted toward your daily limit.'
            : 'This is usually temporary.',
        ),
      ).toBeTruthy();
      expect(screen.getByRole('status').textContent).toBe('The language model didn’t respond');
      const retry = screen.getByRole('button', { name: 'Try again' });
      expect(document.activeElement).toBe(retry);
      fireEvent.click(retry);
      expect(submit).toHaveBeenCalledWith('Original question');
    },
  );
  it('TC-104 network error preserves partial text with neutral markers and focuses retry', async () => {
    show({ kind: 'networkError', question, partialText: 'Unverified draft [P1]' });
    expect(screen.getByRole('heading', { name: 'Connection lost' })).toBeTruthy();
    expect(
      screen.getByText('The answer stopped arriving. Check your connection and try again.'),
    ).toBeTruthy();
    expect(screen.getByText('Partial answer, not verified')).toBeTruthy();
    expect(await screen.findByText(/Unverified draft/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Source P1/ })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Try again' }));
  });
  it('server error exposes only the first eight request-id characters and focuses retry', () => {
    show({ kind: 'serverError', question, requestId: done.requestId });
    expect(screen.getByRole('heading', { name: 'Something went wrong on our side' })).toBeTruthy();
    expect(
      screen.getByText('The error has been logged with reference 5b0e0000. Try again in a minute.'),
    ).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Try again' }));
  });
  it('TC-105 stopped keeps unverified text and related sources, announces Stop and offers another question', async () => {
    const { askAnother } = show({ kind: 'stopped', question, partialText: 'Draft [P1]', meta });
    expect(
      screen.getByRole('heading', { name: 'Stopped. This partial answer was not verified.' }),
    ).toBeTruthy();
    expect(await screen.findByText(/Draft/)).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Stopped');
    expect(screen.getByRole('heading', { name: 'Sources' })).toBeTruthy();
    expect(
      within(
        screen.getByRole('region', { name: 'Stopped. This partial answer was not verified.' }),
      ).queryByRole('button', { name: /^Source P1/ }),
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ask another question' }));
    expect(askAnother).toHaveBeenCalledOnce();
  });
});
