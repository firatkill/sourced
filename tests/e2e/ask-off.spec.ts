import { expect, test } from '@playwright/test';
import { openAsk } from './helpers/ask';

test('TC-102: E2E-14 offline mode replaces form and chips with navigation', async ({
  page,
}, info) => {
  await openAsk(page, info, 3102);
  await expect(
    page.getByRole('heading', { name: 'The demo is offline for maintenance' }),
  ).toBeVisible();
  await expect(
    page.getByText('The evaluation results and the write-up are still available.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'See evaluation results' })).toHaveAttribute(
    'href',
    '/eval',
  );
  await expect(page.getByRole('link', { name: 'Read how it works' })).toHaveAttribute(
    'href',
    '/how-it-works',
  );
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'When should I use a partial index?' }),
  ).toHaveCount(0);
});
