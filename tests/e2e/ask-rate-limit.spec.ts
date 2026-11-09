import { expect, test } from '@playwright/test';
import { ask, openAsk, liveAnswers, cachedAnswer } from './helpers/ask';

test('TC-100: E2E-11 fourth question is limited but suggested answers still work', async ({
  page,
}, info) => {
  await openAsk(page, info);
  await liveAnswers(page, 3);
  const response = page.waitForResponse((r) => r.url().endsWith('/api/ask') && r.status() === 429);
  await ask(page);
  expect((await response).status()).toBe(429);
  await expect(page.getByRole('heading', { name: 'You’ve reached today’s limit' })).toBeVisible();
  await expect(
    page.getByText(
      /^Each visitor can ask 3 questions per day so the demo stays free to run\. Your limit resets at .+ \(.*\)\.$/,
    ),
  ).toBeVisible();
  await expect(
    page.getByText('The suggested questions above still work.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Your question' })).toBeFocused();
  await cachedAnswer(page);
});
