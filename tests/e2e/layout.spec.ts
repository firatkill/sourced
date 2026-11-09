import { expect, test } from '@playwright/test';
import { uniqueIp } from './helpers';

test.beforeEach(async ({ page }, testInfo) => {
  await page.setExtraHTTPHeaders({ 'x-real-ip': uniqueIp(testInfo) });
});

test('TC-019: PRD §9.1 shared landmarks, exact copy and keyboard skip link', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await skip.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  await expect(
    page.getByRole('banner').getByRole('link', { name: 'Sourced', exact: true }),
  ).toHaveAttribute('href', '/');
  const nav = page.getByRole('navigation', { name: 'Main', exact: true });
  await expect(nav.getByRole('link', { name: 'Ask', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  for (const [name, href] of [
    ['Ask', '/'],
    ['Evaluation', '/eval'],
    ['How it works', '/how-it-works'],
    ['GitHub', 'https://github.com/firatkill/sourced'],
  ] as const) {
    await expect(nav.getByRole('link', { name, exact: true })).toHaveAttribute('href', href);
  }
  const footer = page.getByRole('contentinfo');
  await expect(footer).toContainText('Built by Fırat Kıl · firatkil.com · Source on GitHub (MIT)');
  await expect(footer).toContainText(
    'Answers are generated from the PostgreSQL 17 documentation, © The PostgreSQL Global Development Group, used under the PostgreSQL License.',
  );
  await expect(footer).toContainText('Privacy: questions are not stored. Read how this works.');
  await expect(footer.getByRole('link', { name: 'PostgreSQL License' })).toHaveAttribute(
    'href',
    'https://www.postgresql.org/about/licence/',
  );
  await expect(footer.getByRole('link', { name: 'Read how this works.' })).toHaveAttribute(
    'href',
    '/how-it-works#privacy',
  );
});

test('TC-020: PRD §9.7 exact not-found copy', async ({ page }) => {
  await page.goto('/does-not-exist');
  await expect(page.getByRole('heading', { name: 'Page not found', level: 1 })).toBeVisible();
  await expect(page.getByText('There is nothing at this address.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go to the ask page' })).toHaveAttribute('href', '/');
});

// REDESIGN §6 shared top bar and attribution, TRD §15.6 landmarks.
for (const [path, current] of [
  ['/eval', 'Evaluation'],
  ['/how-it-works', 'How it works'],
  ['/missing-r1', null],
] as const) {
  test(`R1 content shell: ${path}`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(path);
    const nav = page.getByRole('navigation', { name: 'Main', exact: true });
    await expect(nav.getByRole('link')).toHaveCount(4);
    await expect(
      page
        .getByRole('banner')
        .getByRole('link', { name: 'Sourced', exact: true })
        .locator('svg[aria-hidden="true"]'),
    ).toHaveCount(1);
    if (current)
      await expect(nav.getByRole('link', { name: current, exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      );
    else await expect(nav.locator('[aria-current]')).toHaveCount(0);
    await expect(page.getByRole('main')).toHaveAttribute('id', 'content');
    await expect(page.getByRole('contentinfo')).toContainText(
      'The PostgreSQL Global Development Group',
    );
    for (const control of await nav.locator('a, button').all()) {
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
}
