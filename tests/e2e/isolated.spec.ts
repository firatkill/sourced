// REDESIGN §3–§4, §7: chat turns retain the existing state and accessibility contracts.
import { expect, test } from '@playwright/test';
import { ask, openAsk, cachedAnswer } from './helpers/ask';
import { withGlobalCap } from './helpers/db';

test.describe.configure({ mode: 'serial' });

test('TC-101: E2E-12 @isolated global cap and cached bypass', async ({ page }, info) => {
  await openAsk(page, info);
  await withGlobalCap(async () => {
    const response = page.waitForResponse(
      (r) => r.url().endsWith('/api/ask') && r.status() === 429,
    );
    await ask(page);
    expect((await response).status()).toBe(429);
    await expect(
      page.getByRole('heading', { name: 'The demo has reached its daily limit' }),
    ).toBeVisible();
    await expect(
      page.getByText(
        /^Sourced answers up to 1000 questions a day across all visitors\. It resets at .+ \(.*\)\. The suggested questions still work, and you can run Sourced yourself from the GitHub repository\.$/,
      ),
    ).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Your question' })).toBeFocused();
    await cachedAnswer(page);
  });
});
