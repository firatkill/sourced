import { randomUUID } from 'node:crypto';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { openAsk, expectDone } from './helpers/ask';

async function tabTo(page: Page, target: Locator) {
  for (let step = 0; step < 60; step++) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  await expect(target).toBeFocused();
}
// REDESIGN §3.1–3, §4, §7; retains E2E-18 keyboard-only submission/Stop/disclosure checks.
for (const theme of ['light', 'dark'] as const) {
  test(`TC-108: E2E-18 ${theme} keyboard navigation, submission, viewer, disclosure and Stop`, async ({
    page,
  }, info) => {
    await page.emulateMedia({ colorScheme: theme });
    await openAsk(page, info);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
    const nav = page.getByRole('navigation', { name: 'Main' });
    for (const name of ['Evaluation', 'How it works', 'Source on GitHub']) {
      await tabTo(page, nav.getByRole('link', { name, exact: true }));
      await expect(nav.getByRole('link', { name, exact: true })).toHaveCSS(
        'outline-style',
        'solid',
      );
    }
    await tabTo(page, nav.getByRole('button', { name: /Switch to .* theme/ }));
    const input = page.getByRole('textbox', { name: 'Your question' });
    await tabTo(page, input);
    await expect(input).toHaveCSS('outline-style', 'solid');
    const question = `When does a partial index help? ${randomUUID()}`;
    await page.keyboard.type(question);
    await page.keyboard.press('Shift+Enter');
    await expect(input).toHaveValue(question + '\n');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Ask', exact: true })).toBeFocused();
    await expect(page.getByRole('button', { name: 'Ask', exact: true })).toHaveCSS(
      'outline-style',
      'solid',
    );
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'not stored', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(
      page.getByRole('button', {
        name: 'What is the difference between REPEATABLE READ and SERIALIZABLE?',
        exact: true,
      }),
    ).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByRole('link', { name: 'not stored', exact: true })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(input).toBeFocused();
    await page.keyboard.press('Enter');
    await expectDone(page);
    const chip = page.getByRole('button', { name: /^Source P1:/ });
    await tabTo(page, chip);
    await expect(chip).toHaveCSS('outline-style', 'solid');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('complementary', { name: 'Source viewer' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(chip).toBeFocused();
    const disclosure = page.getByRole('button', { name: 'How this was answered' });
    await tabTo(page, disclosure);
    await expect(disclosure).toHaveCSS('outline-style', 'solid');
    await page.keyboard.press('Enter');
    await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Space');
    await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    await tabTo(page, input);
    await page.keyboard.type(`When does a partial index help? mock:slow ${randomUUID()}`);
    await page.keyboard.press('Enter');
    await expect(
      page
        .getByRole('article', { name: 'Answer' })
        .last()
        .getByText(/^According to the documentation/),
    ).toBeVisible();
    const stop = page.getByRole('button', { name: 'Stop', exact: true });
    await tabTo(page, stop);
    await expect(stop).toHaveCSS('outline-style', 'solid');
    await page.keyboard.press('Enter');
    await expect(
      page.getByText('Stopped. This partial answer was not verified.', { exact: true }),
    ).toBeVisible();
    await tabTo(page, page.getByRole('button', { name: 'Ask another question' }));
    await page.keyboard.press('Enter');
    await expect(input).toBeFocused();
    await tabTo(page, page.getByRole('button', { name: 'New chat' }));
    await page.keyboard.press('Enter');
    await tabTo(
      page,
      page.getByRole('button', { name: 'When should I use a partial index?', exact: true }),
    );
    await page.keyboard.press('Enter');
    await expectDone(page);
    await expect(page.getByText('Answered in advance', { exact: true })).toBeVisible();
    await tabTo(page, page.getByRole('link', { name: 'Skip to content' }));
    await page.keyboard.press('Enter');
    await expect(page.getByRole('main')).toBeFocused();
  });
  test(`R2: ${theme} rail menu below 768px traps focus and restores its opener`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: theme });
    await openAsk(page, info);
    const menu = page.getByRole('button', { name: 'Menu', exact: true });
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
    await menu.focus();
    await menu.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Main menu' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('navigation', { name: 'Main' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /Switch to .* theme/ })).toHaveText(
      /Switch to .* theme/,
    );
    for (let i = 0; i < 18; i++) {
      await page.keyboard.press(i < 9 ? 'Tab' : 'Shift+Tab');
      expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(menu).toBeFocused();
    await menu.click();
    await dialog.getByRole('button', { name: 'Close menu' }).click();
    await expect(menu).toBeFocused();
    await page.setViewportSize({ width: 768, height: 844 });
    await expect(menu).toBeHidden();
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  });
}
