// REDESIGN §3–§4, §7: chat turns retain the existing state and accessibility contracts.
import { expect, test } from '@playwright/test';
import { ask, openAsk } from './helpers/ask';

test('TC-103: E2E-15 provider failure refunds and retry submits the same question', async ({
  page,
}, info) => {
  await openAsk(page, info);
  const question = await ask(page, 'mock:provider-error');
  await expect(
    page
      .getByRole('article', { name: 'Answer' })
      .last()
      .getByRole('heading', { name: 'The language model didn’t respond' }),
  ).toBeVisible();
  await expect(
    page.getByText(
      'This is usually temporary. This question was not counted toward your daily limit.',
      { exact: true },
    ),
  ).toBeVisible();
  const retry = page
    .getByRole('article', { name: 'Answer' })
    .last()
    .getByRole('button', { name: 'Try again' });
  await expect(retry).toBeFocused();
  const request = page.waitForRequest((r) => r.url().endsWith('/api/ask') && r.method() === 'POST');
  await retry.click();
  expect((await request).postDataJSON()).toEqual({ question });
  await expect(retry).toBeFocused();
  await expect(
    page
      .getByRole('article', { name: 'Answer' })
      .last()
      .getByRole('heading', { name: 'The language model didn’t respond' }),
  ).toBeVisible();
  await ask(page, 'mock:error-midstream');
  await expect(
    page
      .getByRole('article', { name: 'Answer' })
      .last()
      .getByRole('heading', { name: 'The language model didn’t respond' }),
  ).toBeVisible();
  await expect(page.getByText('This is usually temporary.', { exact: true })).toBeVisible();
  await expect(
    page
      .getByRole('article', { name: 'Answer' })
      .last()
      .getByText(/This question was not counted/),
  ).toHaveCount(0);
  await expect(retry).toBeFocused();
});
