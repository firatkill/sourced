import { expect, test } from '@playwright/test';
import { ask, openAsk, expectDone } from './helpers/ask';

test('TC-098: E2E-09 invalid markers are removed from the final answer', async ({ page }, info) => {
  await openAsk(page, info);
  await ask(page, 'mock:invalid-citation');
  await expectDone(page);
  const answer = page.getByRole('region', { name: 'Answer', exact: true });
  await expect(answer.getByRole('button', { name: /^Source P/ })).toHaveCount(2);
  await expect(answer).not.toContainText('[P3]');
  await expect(answer).not.toContainText('[P9]');
  const claims = answer.locator('p').filter({ hasText: 'This claim has no supporting quote' });
  await expect(claims).not.toContainText('P3');
  await expect(claims).not.toContainText('P9');
  await expect(
    page.getByText(
      '2 citations were removed because their quotes were not found in the passages.',
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole('button', { name: 'How this was answered' }).click();
  await expect(
    page.getByText('P3 removed: the quote was not found in the passage.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('P9 removed: it points to a passage that was not retrieved.', { exact: true }),
  ).toBeVisible();
});
