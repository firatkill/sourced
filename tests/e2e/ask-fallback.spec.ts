import { expect, test } from '@playwright/test';
import { ask, openAsk, expectDone } from './helpers/ask';

test('TC-099: E2E-10 missing quote block uses the quote extraction fallback', async ({
  page,
}, info) => {
  await openAsk(page, info);
  await ask(page, 'mock:no-block');
  await expectDone(page);
  await expect(page.getByRole('button', { name: /^Source P/ })).toHaveCount(2);
  await page.getByRole('button', { name: 'How this was answered' }).click();
  await expect(
    page.getByText(
      'The model did not include supporting quotes, so they were extracted in a second call.',
      { exact: true },
    ),
  ).toBeVisible();
});
