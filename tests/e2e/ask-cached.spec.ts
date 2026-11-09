import { expect, test } from '@playwright/test';
import { openAsk, liveAnswers, cachedAnswer } from './helpers/ask';

test('TC-106: E2E-25 cached answer disclosure and unchanged visitor quota', async ({
  page,
}, info) => {
  await openAsk(page, info);
  await cachedAnswer(page);
  await page.getByRole('button', { name: 'How this was answered' }).click();
  await expect(
    page.getByText(
      /^This answer was generated in advance on .+ and served from the cache\. No language model was called\.$/,
    ),
  ).toBeVisible();
  await expect(page.getByRole('table', { name: 'Passages ranked for this answer' })).toBeVisible();
  await expect(page.getByText(/^Retrieval \d+ ms/)).toHaveCount(0);
  await expect(page.getByText(/^Tokens:/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Ask another question' }).click();
  await liveAnswers(page, 3);
});
