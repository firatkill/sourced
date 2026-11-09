// REDESIGN §3–§4, §7: chat turns retain the existing state and accessibility contracts.
import { expect, test } from '@playwright/test';
import { ask, openAsk } from './helpers/ask';

test('TC-097: E2E-08 not found has related reading without draft or highlights', async ({
  page,
}, info) => {
  await openAsk(page, info);
  await ask(page, 'mock:not-found');
  await expect(
    page.getByRole('heading', { name: 'I couldn’t find this in the PostgreSQL docs.' }),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Sourced only answers from the 35 pages it has indexed. These passages came closest:',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Related reading' })).toBeVisible();
  await expect(
    page
      .getByRole('article', { name: 'Answer' })
      .getByRole('link', { name: /\(opens in a new tab\)$/ }),
  ).toHaveCount(6);
  await expect(page.locator('mark')).toHaveCount(0);
  await expect(page.getByText(/^According to the documentation/)).toHaveCount(0);
  await expect(page.getByRole('status')).toHaveText(
    'No answer found in the docs. Related reading is listed.',
  );
  await page.getByRole('button', { name: 'Ask another question' }).click();
  await expect(page.getByRole('textbox', { name: 'Your question' })).toBeFocused();
});
