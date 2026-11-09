import { expect, test } from '@playwright/test';
import { ask, openAsk } from './helpers/ask';

for (const mode of ['drop', 'abort'] as const) {
  test(`TC-104: E2E-16 network ${mode} shows connection lost and retry`, async ({ page }, info) => {
    await openAsk(page, info);
    if (mode === 'abort') await page.route('/api/ask', (route) => route.abort());
    await ask(page, mode === 'drop' ? 'mock:drop' : '');
    await expect(page.getByRole('heading', { name: 'Connection lost' })).toBeVisible();
    await expect(
      page.getByText('The answer stopped arriving. Check your connection and try again.', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByText('Partial answer, not verified', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeFocused();
    if (mode === 'drop') await expect(page.getByText(/^According to/)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Source P/ })).toHaveCount(0);
  });
}
