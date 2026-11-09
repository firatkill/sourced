// @vitest-environment jsdom
// T-40 / TC-146, FR-04–FR-07, NFR-09: lazy Markdown must preserve the answer lifecycle.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AskApp } from '@/components/ask/AskApp';
import { useAsk, isInFlight, askStatus, type Phase } from '@/hooks/useAsk';
import { ASK_COPY } from '@/lib/copy';
import { meta, citations, done } from '../fixtures/sse-streams';

const loading = vi.hoisted(() => {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { gate, release, started: vi.fn() };
});
vi.mock('@/components/ask/AnswerView', async (importOriginal) => {
  loading.started();
  await loading.gate;
  return importOriginal<typeof import('@/components/ask/AnswerView')>();
});
const actionsLoading = vi.hoisted(() => {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { gate, release, started: vi.fn() };
});
vi.mock('@/components/ask/AnswerActions', async (importOriginal) => {
  actionsLoading.started();
  await actionsLoading.gate;
  return importOriginal<typeof import('@/components/ask/AnswerActions')>();
});
vi.mock('@/hooks/useAsk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useAsk')>()),
  useAsk: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('TC-146: defers Markdown until submission and preserves streaming, verified chips, focus and deferred Copy actions', async () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
  const question = 'How do partial indexes work?';
  const askAnother = vi.fn();
  function phase(value: Phase) {
    vi.mocked(useAsk).mockReturnValue({
      phase: value,
      question,
      citations: value.kind === 'done' ? value.citations : null,
      inputRef: { current: null },
      setQuestion: vi.fn(),
      submit: vi.fn(async () => {}),
      stop: vi.fn(),
      askAnother,
      inFlight: isInFlight(value),
      status: askStatus(value),
    });
  }
  const app = () => (
    <AskApp
      demoMode="on"
      limits={{ ipDaily: 3, globalDaily: 300 }}
      suggested={[]}
      copy={ASK_COPY}
    />
  );
  phase({ kind: 'idle' });
  const view = render(app());
  expect(loading.started).not.toHaveBeenCalled();
  expect(actionsLoading.started).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: question } });
  fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
  phase({ kind: 'submitting', question });
  view.rerender(app());
  await waitFor(() => {
    expect(loading.started).toHaveBeenCalledOnce();
  });
  const answer = screen.getByRole('article', { name: /^Answer$/ });
  expect(answer.getAttribute('aria-busy')).toBe('true');
  expect(screen.getByRole('status').textContent).toBe('Searching the docs');
  expect(answer.querySelector('[aria-hidden="true"].min-h-7')).not.toBeNull();

  phase({ kind: 'streaming', question, meta, text: 'Latest streamed draft [P1]' });
  view.rerender(app());
  expect(screen.queryByRole('region', { name: 'Sources' })).toBeNull();
  await act(async () => {
    loading.release();
    await loading.gate;
  });
  expect(await screen.findByText(/Latest streamed draft/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: /^Source P1:/ })).toBeNull();
  expect(screen.getByRole('status').textContent).not.toContain('Latest streamed draft');

  expect(actionsLoading.started).not.toHaveBeenCalled();
  phase({ kind: 'done', question, meta, citations, done });
  view.rerender(app());
  await waitFor(() => {
    expect(actionsLoading.started).toHaveBeenCalledOnce();
  });
  expect(screen.queryByRole('button', { name: 'Copy as Markdown' })).toBeNull();
  const chip = await screen.findByRole('button', { name: /^Source P1:/ });
  expect(screen.getByRole('article', { name: /^Answer$/ }).getAttribute('aria-busy')).toBe('false');
  expect(screen.queryByText(/Latest streamed draft/)).toBeNull();
  expect(screen.getByRole('status').textContent).toBe('Answer ready with 1 verified source.');
  chip.focus();
  fireEvent.click(chip);
  const viewer = screen.getByRole('complementary', { name: 'Source viewer' });
  expect(document.activeElement).toBe(viewer);
  await act(async () => {
    actionsLoading.release();
    await actionsLoading.gate;
  });
  const copy = await screen.findByRole('button', { name: 'Copy as Markdown' });
  expect(document.activeElement).toBe(viewer);
  const writeText = vi.fn<(value: string) => Promise<void>>(async () => {});
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  copy.focus();
  fireEvent.click(copy);
  // The clipboard call must happen in the click's activation, before any awaited import.
  expect(writeText).toHaveBeenCalledExactlyOnceWith(
    'A partial index covers only the rows that satisfy its predicate [1].\n\nSources:\n' +
      '[1] 11.8. Partial Indexes › 11.8. Partial Indexes — https://www.postgresql.org/docs/17/indexes-partial.html#INDEXES-PARTIAL',
  );
  expect(await screen.findByRole('button', { name: 'Copied' })).toBe(copy);
  expect(document.activeElement).toBe(copy);
  fireEvent.click(
    within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', {
      name: 'New chat',
    }),
  );
  expect(screen.queryByRole('article', { name: 'Answer' })).toBeNull();
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Ask the PostgreSQL docs.');
});
