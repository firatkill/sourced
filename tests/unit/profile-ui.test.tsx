// @vitest-environment jsdom
// TC-190 / FR-64: no replacement for quota helper text outside public-demo.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { AskForm } from '@/components/ask/AskForm';

afterEach(cleanup);
test.each([null, 3])('TC-190: quota helper with dailyLimit=%s', (dailyLimit) => {
  render(
    <AskForm
      question=""
      onChange={vi.fn()}
      onSubmit={vi.fn()}
      inputRef={{ current: null }}
      inFlight={false}
      disabled={false}
      dailyLimit={dailyLimit}
      error={null}
    />,
  );
  const helper = document.getElementById('question-helper');
  expect(helper !== null).toBe(dailyLimit !== null);
  expect(
    screen.getByRole('textbox').getAttribute('aria-describedby')?.includes('question-helper'),
  ).toBe(dailyLimit !== null);
  if (dailyLimit !== null)
    expect(helper?.textContent).toContain('3 questions per visitor per day.');
});
