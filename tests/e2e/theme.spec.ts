import { expect, test } from '@playwright/test';
import { uniqueIp } from './helpers';

test.beforeEach(async ({ page }, testInfo) => {
  await page.setExtraHTTPHeaders({ 'x-real-ip': uniqueIp(testInfo) });
});

test('TC-017: E2E-20 system dark is effective without a stored override', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
  await expect(page.getByRole('button', { name: 'Switch to light theme' })).toBeVisible();
});

test('TC-018: E2E-20 toggle persists before rendering after reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload({ waitUntil: 'domcontentloaded' });
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await page.reload({ waitUntil: 'domcontentloaded' });
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
});

for (const colorScheme of ['light', 'dark'] as const) {
  for (const stored of [null, 'light', 'dark'] as const) {
    test(`TC-145: clean console with system ${colorScheme}, stored ${String(stored)}`, async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error' || /hydration|hydrated|did not match/i.test(message.text()))
          errors.push(message.text());
      });
      await page.emulateMedia({ colorScheme });
      await page.addInitScript((theme) => {
        if (theme) localStorage.setItem('sourced-theme', theme);
        else localStorage.removeItem('sourced-theme');
      }, stored);
      for (const path of ['/', '/eval', '/how-it-works']) {
        const response = await page.goto(path);
        const csp = response?.headers()['content-security-policy'] ?? '';
        const scriptPolicy = csp.split(';').find((part) => part.trim().startsWith('script-src '));
        expect(scriptPolicy).toContain("'nonce-");
        expect(scriptPolicy).not.toContain("'unsafe-inline'");
        await expect(page.locator('html')).toHaveCSS('color-scheme', stored ?? colorScheme);
        // REDESIGN §2 token values apply on ask and both content pages.
        await expect(page.locator('body')).toHaveCSS(
          'background-color',
          (stored ?? colorScheme) === 'dark' ? 'rgb(17, 19, 23)' : 'rgb(250, 250, 248)',
        );
        await expect(page.locator('body')).toHaveCSS(
          'color',
          (stored ?? colorScheme) === 'dark' ? 'rgb(236, 238, 242)' : 'rgb(22, 24, 29)',
        );
        await expect(page.locator('body')).toHaveCSS('font-size', '16px');
        // Interact to prove hydration finished before inspecting the console.
        await page.getByRole('button', { name: /Switch to .* theme/ }).click();
        await expect(page.locator('html')).toHaveCSS(
          'color-scheme',
          (stored ?? colorScheme) === 'light' ? 'dark' : 'light',
        );
        expect(errors).toEqual([]);
      }
    });
  }
}
