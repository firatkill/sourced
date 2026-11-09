import { expect, test } from '@playwright/test';
import { ask, openAsk } from './helpers/ask';

test('TC-105: E2E-24 Stop preserves partial text without verifying it', async ({ page }, info) => {
  await openAsk(page, info);
  await ask(page, 'mock:slow');
  // TRD §23.4 permits this wait for the deliberately slow (250 ms/token) stream.
  const partial = page.getByText(/^According to the documentation/);
  await expect(partial).toBeVisible();
  const text = await partial.innerText();
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(
    page.getByText('Stopped. This partial answer was not verified.', { exact: true }),
  ).toBeVisible();
  await expect(partial).toContainText(text);
  await expect(page.getByRole('status')).toHaveText('Stopped');
  await expect(page.getByRole('button', { name: /^Source P/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Ask another question' }).click();
  await expect(page.getByRole('textbox', { name: 'Your question' })).toBeFocused();
});
