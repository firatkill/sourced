import { expect, test } from '@playwright/test';
import { ask, openAsk, expectDone } from './helpers/ask';

// REDESIGN §3.1–2 (lines 62–63), §4 (line 70), §8 (line 133).
for (const theme of ['light', 'dark'] as const) {
  test(`R2: ${theme} history stays in memory, navigation focuses turns, New chat clears`, async ({
    page,
  }, info) => {
    await page.emulateMedia({ colorScheme: theme });
    await openAsk(page, info);
    const first = await ask(page);
    await expectDone(page);
    const request = page.waitForRequest('**/api/ask');
    const second = await ask(page);
    expect((await request).postDataJSON()).toEqual({ question: second });
    await expectDone(page);
    await expect(page.getByRole('article', { name: 'Answer' })).toHaveCount(2);
    const session = page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('region', { name: 'This session' });
    await expect(session.getByRole('button')).toHaveText([first, second]);
    await session.getByRole('button', { name: first, exact: true }).click();
    await expect(page.locator('#turn-1')).toBeFocused();
    await expect(page.locator('#turn-1')).toBeInViewport();
    await page.getByRole('button', { name: 'New chat' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ask the PostgreSQL docs.');
    await expect(page.getByRole('article', { name: 'Answer' })).toHaveCount(0);
    await expect(session.getByRole('button')).toHaveCount(0);
    await ask(page);
    await expectDone(page);
    await page.reload();
    await expect(page.getByRole('article', { name: 'Answer' })).toHaveCount(0);
    await expect(session.getByRole('button')).toHaveCount(0);
  });
  test(`R2: ${theme} one request at a time and New chat waits for Stop`, async ({ page }, info) => {
    await page.emulateMedia({ colorScheme: theme });
    await openAsk(page, info);
    const requests: string[] = [];
    page.on('request', (request) => {
      if (request.url().endsWith('/api/ask')) requests.push(request.url());
    });
    await ask(page, 'mock:slow');
    await expect(page.getByText(/^According to the documentation/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'New chat' })).toBeDisabled();
    await page.getByRole('textbox').press('Enter');
    expect(requests).toHaveLength(1);
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    await page.getByRole('button', { name: 'New chat' }).click();
    await expect(page.getByRole('article', { name: 'Answer' })).toHaveCount(0);
  });
}
