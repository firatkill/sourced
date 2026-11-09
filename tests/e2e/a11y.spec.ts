import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { ask, openAsk, expectDone, liveAnswers } from './helpers/ask';

for (const theme of ['light', 'dark'] as const) {
  for (const state of ['empty', 'done', 'not-found', 'rate-limited', '/eval', '/how-it-works']) {
    test(`TC-107: E2E-17 ${theme} ${state} has no serious or critical accessibility violations`, async ({
      page,
    }, info) => {
      await page.emulateMedia({ colorScheme: theme });
      await openAsk(page, info);
      if (state.startsWith('/')) await page.goto(state);
      if (state === 'done') {
        await ask(page);
        await expectDone(page);
      }
      if (state === 'not-found') {
        await ask(page, 'mock:not-found');
        await expect(page.getByRole('heading', { name: 'Related reading' })).toBeVisible();
      }
      if (state === 'rate-limited') {
        await liveAnswers(page, 3);
        await ask(page);
        await expect(
          page.getByRole('heading', { name: 'You’ve reached today’s limit' }),
        ).toBeVisible();
      }
      await expect(page.locator('html')).toHaveCSS('color-scheme', theme);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(
        results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
      ).toEqual([]);
    });
  }
}
