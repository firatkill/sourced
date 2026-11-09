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
  expect(screen.getByRole('heading', { name: 'Evaluation', level: 1 })).toBeTruthy();
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
  expect(screen.getAllByText('No previous run')).toHaveLength(9);
  expect(screen.getAllByRole('img')).toHaveLength(9);
  expect(screen.queryByText('Below floor')).toBeNull();
  expect(screen.queryByText('Above ceiling')).toBeNull();
  expect(screen.getByText('Ceiling 15.0 s')).toBeTruthy();
  for (const svg of screen.getAllByRole('img')) {
    expect(svg.querySelector('polyline')?.getAttribute('points')).not.toMatch(/NaN|Infinity/);
  }
});

test('TC-133 / D-84: negative latency and cost deltas retain their units and precision', () => {
  const previous = EvalResult.parse(older);
  const latest = EvalResult.parse(newer);
  latest.metrics.latencyMs.p95 = previous.metrics.latencyMs.p95 - 900;
  latest.metrics.cost.totalUsd = previous.metrics.cost.totalUsd - 0.0123;
  render(<EvalView runs={[previous, latest]} />);
  expect(screen.getByText('−0.9 s vs previous')).toBeTruthy();
  expect(screen.getByText('−$0.0123 vs previous')).toBeTruthy();
  const cost = within(screen.getByRole('article', { name: 'Cost per run' }));
  expect(cost.queryByText(/Floor|Ceiling|Below floor|Above ceiling/)).toBeNull();
});
