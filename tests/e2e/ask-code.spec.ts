import { expect, test } from '@playwright/test';
import { routeLongAnswer } from './helpers/long-answer';
import { ask, openAsk } from './helpers/ask';

// REDESIGN §5.1, §5.3–4 (lines 86, 88–89): validated SSE SQL, exact copy timing.
for (const theme of ['light', 'dark'] as const) {
  test(`R2: ${theme} SQL token spans and Copy code`, async ({ page, context }, info) => {
    await page.emulateMedia({ colorScheme: theme });
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await routeLongAnswer(page);
    await openAsk(page, info);
    await ask(page);
    const figure = page.locator('figure');
    await expect(figure.locator('figcaption')).toContainText('SQL');
    await expect(figure.locator('[data-sql-token="keyword"]').first()).toHaveText('SELECT');
    expect(await figure.locator('[data-sql-token="identifier"]').count()).toBeGreaterThan(0);
    const expected = `SELECT ${'long_column, '.repeat(100)}last_column;\n`;
    await expect(figure.locator('pre code')).toHaveText(expected);
    await page.clock.install({ time: 0 });
    await page.clock.pauseAt(1000);
    const copy = figure.getByRole('button', { name: 'Copy code' });
    await copy.click();
    await expect(copy).toHaveText('Copied');
    await expect(figure.getByRole('status')).toHaveText('Code copied');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(expected);
    await page.clock.runFor(1999);
    await expect(copy).toHaveText('Copied');
    await page.clock.runFor(1);
    await expect(copy).toHaveText('Copy');
    await expect(figure.getByRole('status')).toBeEmpty();
  });
}
