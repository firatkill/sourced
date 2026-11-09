import { expect, test } from '@playwright/test';
import { completeAnswer, expectedCopy } from './helpers/answer';

// FR-07; TRD UT-28, E2E-06.
test('TC-093: clipboard plain text and exactly two-second Copied label', async ({
  page,
  context,
}, testInfo) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const fixture = await completeAnswer(page, testInfo);
  await page.clock.install({ time: 0 });
  await page.clock.pauseAt(1000);
  await page.getByRole('button', { name: 'Copy answer', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Copied', exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(expectedCopy(fixture));
  await page.clock.runFor(1999);
  await expect(page.getByRole('button', { name: 'Copied', exact: true })).toBeVisible();
  await page.clock.runFor(1);
  await expect(page.getByRole('button', { name: 'Copy answer', exact: true })).toBeVisible();
});

test('TC-093: clipboard rejection falls back to textarea and restores focus', async ({
  page,
}, testInfo) => {
  const fixture = await completeAnswer(page, testInfo);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new Error('denied')) },
    });
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- exercises the required TRD §15.5 fallback
    document.execCommand = (command) => {
      if (command === 'copy' && document.activeElement instanceof HTMLTextAreaElement) {
        document.documentElement.dataset.copied = document.activeElement.value;
        return true;
      }
      return false;
    };
  });
  await page.getByRole('button', { name: 'Copy answer', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Copied', exact: true })).toBeFocused();
  expect(await page.locator('html').getAttribute('data-copied')).toBe(expectedCopy(fixture));
  await expect(page.locator('textarea')).toHaveCount(1);
});
