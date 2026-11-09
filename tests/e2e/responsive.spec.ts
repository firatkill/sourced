// REDESIGN §3–§4, §7: chat turns retain the existing state and accessibility contracts.
import { expect, test } from '@playwright/test';
import { ask, openAsk, expectDone } from './helpers/ask';

for (const theme of ['light', 'dark'] as const) {
  for (const viewport of [
    { width: 360, height: 740 },
    { width: 1024, height: 768 },
    { width: 1920, height: 1080 },
  ]) {
    test(`TC-109 / TC-141: E2E-19 ${theme} responsive pages at ${String(viewport.width)}px`, async ({
      page,
    }, info) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize(viewport);
      await openAsk(page, info);
      const noOverflow = async () => {
        await expect
          .poll(() =>
            page.evaluate(
              () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
            ),
          )
          .toBe(true);
      };
      await noOverflow();
      await ask(page);
      await expectDone(page);
      await page.getByRole('button', { name: 'How this was answered' }).click();
      await noOverflow();
      const cards = page.getByRole('region', { name: 'Sources', exact: true });
      await expect(cards.getByRole('button')).toHaveCount(2);
      await cards.getByRole('button').first().click();
      await expect(
        page.getByRole(viewport.width < 1024 ? 'dialog' : 'complementary', {
          name: 'Source viewer',
        }),
      ).toBeVisible();
      await noOverflow();
      await page.keyboard.press('Escape');
      for (const path of ['/eval', '/how-it-works', '/does-not-exist']) {
        await page.goto(path);
        await noOverflow();
      }
    });
  }
}
