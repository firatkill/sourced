// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import ErrorPage from '@/app/error';

afterEach(cleanup);

test('TC-020: PRD §9.7 error boundary copy and retry action', () => {
  const reset = vi.fn();
  render(<ErrorPage error={new Error('internal detail must not render')} reset={reset} />);
  expect(screen.getByRole('heading', { name: 'Something went wrong', level: 1 })).toBeTruthy();
  expect(screen.getByText('The page failed to load. Try again, or come back later.')).toBeTruthy();
  expect(screen.queryByText('internal detail must not render')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(reset).toHaveBeenCalledOnce();
});
