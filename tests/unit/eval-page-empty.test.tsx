// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { EvalView } from '@/components/eval/EvalView';
import { EvalResult } from '@/lib/eval/results-schema';
import older from '../fixtures/eval-results/2026-11-01.json';
import newer from '../fixtures/eval-results/2026-11-02.json';

afterEach(cleanup);

test('TC-131 / UT-31: synchronous empty view renders the exact PRD §9.5 copy', () => {
  render(<EvalView runs={[]} />);
  expect(screen.getByRole('heading', { name: 'How good are the answers?', level: 1 })).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'No evaluation runs yet', level: 2 })).toBeTruthy();
  expect(
    screen.getByText('Run pnpm eval and commit the file it writes to eval/results.'),
  ).toBeTruthy();
  expect(screen.queryByRole('table')).toBeNull();
  expect(
    screen.getByRole('heading', { name: 'How these numbers are computed', level: 2 }),
  ).toBeTruthy();
});

test('TC-133 / D-84: single run has no previous delta; equality at a ceiling is not a warning', () => {
  const run = EvalResult.parse(older);
  run.metrics.latencyMs.p95 = 15000;
  render(<EvalView runs={[run]} />);
  expect(screen.getAllByText('No previous run')).toHaveLength(10);
  expect(screen.queryAllByRole('img')).toHaveLength(0);
  expect(screen.queryByText('Below floor')).toBeNull();
  expect(screen.queryByText('Above ceiling')).toBeNull();
  expect(screen.getByText('Ceiling 15.0 s · time to full answer, p95')).toBeTruthy();
});

test('TC-133 / D-84: negative latency and cost deltas retain their units and precision', () => {
  const previous = EvalResult.parse(older);
  const latest = EvalResult.parse(newer);
  latest.metrics.latencyMs.p95 = previous.metrics.latencyMs.p95 - 900;
  latest.metrics.cost.perQuestionUsd = previous.metrics.cost.perQuestionUsd - 0.0013;
  render(<EvalView runs={[previous, latest]} />);
  expect(screen.getByText('−0.9 s vs previous')).toBeTruthy();
  expect(screen.getByText('−$0.0013 vs previous')).toBeTruthy();
  const cost = within(screen.getByRole('article', { name: 'Cost per answer' }));
  expect(cost.getByText('Ceiling $0.0200 · answer-call cost per question')).toBeTruthy();
  expect(screen.getAllByRole('img')).toHaveLength(10);
});

test('R1 / REDESIGN §6.1 and §7: lead counts and result filename come from the loaded run', () => {
  const run = { ...EvalResult.parse(newer), sourceFile: '2026-11-02-2.json' };
  run.metrics.counts = { total: 7, answerable: 3, unanswerable: 2, injection: 2 };
  render(<EvalView runs={[run]} />);
  expect(
    screen.getByText(
      'Every change to search or prompts is tested against 7 hand-written questions: 3 the docs can answer, 2 they cannot, and 2 that try to hijack the model. A run that falls below a floor fails CI.',
    ),
  ).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Full results file' }).getAttribute('href')).toBe(
    'https://github.com/firatkill/sourced/blob/main/eval/results/2026-11-02-2.json',
  );
});
