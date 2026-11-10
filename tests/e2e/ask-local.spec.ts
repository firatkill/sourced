// TC-190 / FR-64 / T-51. Runs only against the local-profile fixture on 3103.
import { expect, test } from '@playwright/test';
import { openAsk, expectDone, liveAnswers } from './helpers/ask';

test('TC-190: @local no quota copy or cache labels, even with DEMO_MODE off', async ({
  page,
}, info) => {
  await openAsk(page, info, 3103);
  await expect(page.getByRole('textbox', { name: 'Your question' })).toBeEnabled();
  await expect(page.locator('#question-helper')).toHaveCount(0);
  await expect(page.getByText(/questions per visitor per day/)).toHaveCount(0);
  await page.locator('[aria-labelledby="suggested-heading"] button').first().click();
  await expectDone(page);
  await expect(page.getByText('Answered in advance', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'How this was answered' }).click();
  await expect(page.getByText(/served from the cache/)).toHaveCount(0);
  await expect(page.getByText(/^Tokens:/)).toBeVisible();
  await liveAnswers(page, 4);
  await expect(page.locator('#question-helper')).toHaveCount(0);
});
