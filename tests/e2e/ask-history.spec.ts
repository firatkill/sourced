import { expect, test } from '@playwright/test';
import { ask, openAsk, expectDone } from './helpers/ask';

// REDESIGN §3.1–2 (lines 62–63), §4 (line 70), §8 (line 133).
for (const theme of ['light', 'dark'] as const) {
  test(`D-154: ${theme} chats are kept in the tab, follow-ups carry history, New chat clears`, async ({
    page,
  }, info) => {
    await page.emulateMedia({ colorScheme: theme });
    await openAsk(page, info);
    const first = await ask(page);
    await expectDone(page);
    const request = page.waitForRequest('**/api/ask');
    const second = await ask(page);
    // T-85 / D-143: a follow-up carries the earlier answered turn; no chat id goes to the server.
    expect((await request).postDataJSON()).toEqual({
      question: second,
      history: [{ question: first, answer: expect.any(String) as unknown }],
    });
    await expectDone(page);
    await expect(page.getByRole('article', { name: 'Answer' })).toHaveCount(2);
    const chats = page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('region', { name: 'Chats' })
      .getByRole('link');
    await expect(chats).toHaveCount(1);
    await expect(chats.first()).toHaveAttribute('aria-current', 'page');
    await page.getByRole('button', { name: 'New chat' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ask the PostgreSQL docs.');
    await expect(page.getByRole('article', { name: 'Answer' })).toHaveCount(0);
    await expect(page).toHaveURL(/\/$/);
    await ask(page);
    await expectDone(page);
    await expect(chats).toHaveCount(2);
    await page.reload();
    await expect(page.getByRole('article', { name: 'Answer' })).toHaveCount(1);
    await chats.last().click();
    await expect(page.getByRole('article', { name: 'Answer' })).toHaveCount(2);
    await expect(page.getByText(second, { exact: true }).first()).toBeVisible();
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
