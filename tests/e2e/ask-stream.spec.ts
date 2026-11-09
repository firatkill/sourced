// REDESIGN §3–§4, §7: chat turns retain the existing state and accessibility contracts.
import { expect, test } from '@playwright/test';
import { readAnswer, submitAnswer } from './helpers/answer';

declare global {
  interface Window {
    answerObservations: { status: string; text: string; busy: string | null; neutral: boolean }[];
  }
}

// FR-04, FR-05, FR-11; TRD E2E-04. Observe short-lived DOM phases without
// delaying, intercepting, or synthesizing any part of the real SSE response.
test('TC-091: phases, incremental text, verification, and ask-again focus', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    window.answerObservations = [];
    new MutationObserver(() => {
      const answer = document.querySelector('article[aria-label="Answer"]');
      if (!answer) return;
      window.answerObservations.push({
        status: document.querySelector('[role="status"]')?.textContent ?? '',
        text: answer.textContent,
        busy: answer.getAttribute('aria-busy'),
        neutral: [...answer.querySelectorAll('span')].some((span) => span.textContent === '1'),
      });
    }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
  });
  const { question, response } = await submitAnswer(page, testInfo);
  const answer = page.locator('article[aria-label="Answer"]');
  await expect(page.getByRole('status')).toHaveText('Answer ready with 2 verified sources.');
  const result = readAnswer(await response);
  expect(result.events[0]?.event).toBe('meta');
  expect(result.events.at(-2)?.event).toBe('citations');
  expect(result.events.at(-1)?.event).toBe('done');
  expect(result.events.filter((event) => event.event === 'token').length).toBeGreaterThan(1);
  const observations = await page.evaluate(() => window.answerObservations);
  expect(
    new Set(
      observations.filter((item) => item.status === 'Writing the answer').map((item) => item.text),
    ).size,
  ).toBeGreaterThan(1);
  expect(observations.some((item) => item.busy === 'true' && item.neutral)).toBe(true);
  await expect(answer.getByRole('button', { name: /^Source P/ })).toHaveCount(2);
  await expect(answer).toHaveAttribute('aria-busy', 'false');
  const input = page.getByRole('textbox', { name: 'Your question' });
  await expect(input).toHaveAttribute('placeholder', 'Ask another question about PostgreSQL 17');
  await expect(answer).toHaveCount(1);
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('button', { name: question, exact: true })
    .click();
  await expect(page.locator('#turn-1')).toBeFocused();
  await expect
    .poll(() =>
      page.evaluate(() => [...new Set(window.answerObservations.map((item) => item.status))]),
    )
    .toEqual(
      expect.arrayContaining([
        'Searching the docs',
        'Reading 6 passages',
        'Writing the answer',
        // 'Checking citations' is time-based (600 ms gap or citations before done) and is
        // not observable when the mock sends citations and done together; UT-20 covers it (D-80).
        'Answer ready with 2 verified sources.',
      ]),
    );
});
