// REDESIGN §3–§4, §7: chat turns retain the existing state and accessibility contracts.
import { expect, test } from '@playwright/test';
import { ask, openAsk, expectDone } from './helpers/ask';

test('TC-098: E2E-09 invalid markers are removed from the final answer', async ({ page }, info) => {
  await openAsk(page, info);
  await ask(page, 'mock:invalid-citation');
  await expectDone(page);
  const answer = page.getByRole('article', { name: 'Answer', exact: true });
  await expect(answer.getByRole('button', { name: /^Source P/ })).toHaveCount(2);
  await expect(answer).not.toContainText('[P3]');
  await expect(answer).not.toContainText('[P9]');
  const claims = answer.locator('p').filter({ hasText: 'This claim has no supporting quote' });
  await expect(claims).not.toContainText('P3');
  await expect(claims).not.toContainText('P9');
  await expect(
    answer.getByText('2 of 4 citations checked · 2 removed', { exact: true }),
  ).toBeVisible();
  await answer.locator('summary').filter({ hasText: 'Why 2 citations were removed' }).click();
  await expect(
    page.getByText('P3 removed: the quote was not found in the passage.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('P9 removed: it points to a passage that was not retrieved.', { exact: true }),
  ).toBeVisible();
});
