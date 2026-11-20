import { expect, test } from '@playwright/test';
import { uniqueIp } from './helpers';

const themes = [
  {
    value: 'graphite',
    label: 'Graphite',
    scheme: 'dark',
    ground: 'rgb(17, 19, 23)',
    ink: 'rgb(236, 238, 242)',
  },
  {
    value: 'paper',
    label: 'Paper',
    scheme: 'light',
    ground: 'rgb(250, 250, 248)',
    ink: 'rgb(22, 24, 29)',
  },
  {
    value: 'midnight',
    label: 'Midnight',
    scheme: 'dark',
    ground: 'rgb(11, 18, 32)',
    ink: 'rgb(230, 237, 247)',
  },
  {
    value: 'linen',
    label: 'Linen',
    scheme: 'light',
    ground: 'rgb(246, 241, 231)',
    ink: 'rgb(43, 33, 24)',
  },
  {
    value: 'contrast',
    label: 'High contrast',
    scheme: 'dark',
    ground: 'rgb(0, 0, 0)',
    ink: 'rgb(255, 255, 255)',
  },
] as const;

test.beforeEach(async ({ page }, testInfo) => {
  await page.setExtraHTTPHeaders({ 'x-real-ip': uniqueIp(testInfo) });
});

test('TC-017: E2E-20 system dark is effective without a stored override', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
  await expect(page.locator('html')).not.toHaveAttribute('data-theme');
  await expect(page.getByRole('link', { name: 'Appearance', exact: true })).toBeVisible();
});

for (const theme of themes) {
  test(`TC-018: E2E-20 ${theme.value} persists before paint after reload`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    // Observe the head script at the first rendering opportunity, before hydration.
    await page.addInitScript(() => {
      requestAnimationFrame(() => {
        document.documentElement.dataset.firstPaintTheme =
          document.documentElement.dataset.theme ?? 'system';
      });
    });
    await page.goto('/settings/appearance');
    await page.getByRole('radio', { name: new RegExp(`^${theme.label}`) }).check();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme.value);
    expect(await page.evaluate(() => localStorage.getItem('sourced-theme'))).toBe(theme.value);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('data-first-paint-theme', theme.value);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme.value);
    await expect(page.locator('html')).toHaveCSS('color-scheme', theme.scheme);
    await expect(page.getByRole('radio', { name: new RegExp(`^${theme.label}`) })).toBeChecked();
  });
}
for (const [legacy, theme] of [
  ['light', 'paper'],
  ['dark', 'graphite'],
] as const) {
  test(`T-79: legacy ${legacy} maps to ${theme}`, async ({ page }) => {
    await page.addInitScript((value) => {
      localStorage.setItem('sourced-theme', value);
    }, legacy);
    await page.goto('/settings/appearance', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.locator(`input[name="theme"][value="${theme}"]`)).toBeChecked();
  });
}
test('T-79: Match my system removes the override and follows system changes', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/settings/appearance');
  await page.getByRole('radio', { name: /^Linen/ }).check();
  await page.getByRole('radio', { name: /^Match my system/ }).check();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme');
  expect(await page.evaluate(() => localStorage.getItem('sourced-theme'))).toBe('system');
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light');
  await page.reload();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme');
  await expect(page.getByRole('radio', { name: /^Match my system/ })).toBeChecked();
});
test('T-79: text size Large persists before paint; Default removes the override', async ({
  page,
}) => {
  await page.addInitScript(() => {
    requestAnimationFrame(() => {
      document.documentElement.dataset.firstPaintSize =
        document.documentElement.dataset.textSize ?? 'default';
    });
  });
  await page.goto('/settings/appearance');
  await page.getByRole('radio', { name: 'Large', exact: true }).check();
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'large');
  await expect(page.locator('html')).toHaveCSS('font-size', '18px');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('data-first-paint-size', 'large');
  await expect(page.getByRole('radio', { name: 'Large', exact: true })).toBeChecked();
  await page.getByRole('radio', { name: 'Small', exact: true }).check();
  await expect(page.locator('html')).toHaveCSS('font-size', '15px');
  await page.getByRole('radio', { name: 'Default', exact: true }).check();
  await expect(page.locator('html')).not.toHaveAttribute('data-text-size');
});

for (const colorScheme of ['light', 'dark'] as const) {
  for (const stored of [
    null,
    'light',
    'dark',
    ...themes.map((theme) => theme.value),
    'system',
  ] as const) {
    test(`TC-145: clean console with system ${colorScheme}, stored ${String(stored)}`, async ({
      page,
    }) => {
      const errors: string[] = [];
      let current = '';
      page.on('pageerror', (error) => errors.push(`${current}: ${error.message}`));
      page.on('console', (message) => {
        if (message.type() === 'error' || /hydration|hydrated|did not match/i.test(message.text()))
          errors.push(`${current}: ${message.text()}`);
      });
      await page.emulateMedia({ colorScheme });
      await page.addInitScript((theme) => {
        if (theme) localStorage.setItem('sourced-theme', theme);
        else localStorage.removeItem('sourced-theme');
      }, stored);
      const effective =
        stored === 'light'
          ? 'paper'
          : stored === 'dark'
            ? 'graphite'
            : !stored || stored === 'system'
              ? colorScheme === 'light'
                ? 'paper'
                : 'graphite'
              : stored;
      const theme = themes.find((choice) => choice.value === effective)!;
      for (const path of ['/', '/eval', '/how-it-works', '/settings/appearance']) {
        current = path;
        const response = await page.goto(path);
        const csp = response?.headers()['content-security-policy'] ?? '';
        const scriptPolicy = csp.split(';').find((part) => part.trim().startsWith('script-src '));
        expect(scriptPolicy).toContain("'nonce-");
        expect(scriptPolicy).not.toContain("'unsafe-inline'");
        await expect(page.locator('html')).toHaveCSS('color-scheme', theme.scheme);
        await expect(page.locator('body')).toHaveCSS('background-color', theme.ground);
        await expect(page.locator('body')).toHaveCSS('color', theme.ink);
        await expect(page.locator('body')).toHaveCSS('font-size', '16px');
        if (path !== '/settings/appearance')
          await page.getByRole('link', { name: 'Appearance', exact: true }).click();
        // Interact with the hydrated controls before inspecting the console.
        await page.getByRole('radio', { name: /^Linen/ }).check();
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'linen');
        await page.getByRole('radio', { name: /^Midnight/ }).check();
        await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
        expect(errors).toEqual([]);
      }
    });
  }
}
