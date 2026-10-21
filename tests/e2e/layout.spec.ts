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
  const nav = page.getByRole('navigation');
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
