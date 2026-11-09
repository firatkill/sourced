import { randomUUID } from 'node:crypto';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { openAsk, expectDone } from './helpers/ask';

async function tabTo(page: Page, target: Locator) {
  for (let step = 0; step < 40; step++) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  await expect(target).toBeFocused();
}

test('TC-108: E2E-18 keyboard navigation, submission, chips, disclosure and Stop', async ({
  page,
}, info) => {
  await openAsk(page, info);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  for (const name of ['Sourced', 'Ask', 'Evaluation', 'How it works', 'GitHub']) {
    await page.keyboard.press('Tab');
    await expect(page.getByRole('banner').getByRole('link', { name, exact: true })).toBeFocused();
  }
  await page.keyboard.press('Tab');
  await expect(page.getByRole('banner').getByRole('button')).toBeFocused();
  await page.keyboard.press('Tab');
  const input = page.getByRole('textbox', { name: 'Your question' });
  await expect(input).toBeFocused();
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
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(input).toBeFocused();
  await page.keyboard.press('Enter');
  await expectDone(page);
  const chip = page.getByRole('button', { name: /^Source P1:/ });
  await tabTo(page, chip);
  await expect(chip).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('Enter');
  await expect(page.locator('#source-P1')).toBeFocused();
  const disclosure = page.getByRole('button', { name: 'How this was answered' });
  await tabTo(page, disclosure);
  await expect(disclosure).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('Enter');
  await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Space');
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  await tabTo(page, page.getByRole('button', { name: 'Ask another question' }));
  await page.keyboard.press('Enter');
  await expect(input).toBeFocused();
  await page.keyboard.type(`When does a partial index help? mock:slow ${randomUUID()}`);
  await page.keyboard.press('Enter');
  // Deliberately slow mock stream: TRD §23.4 permits this one longer wait.
  await expect(page.getByText(/^According to the documentation/)).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toHaveCSS(
    'outline-style',
    'solid',
  );
  await page.keyboard.press('Enter');
  await expect(
    page.getByText('Stopped. This partial answer was not verified.', { exact: true }),
  ).toBeVisible();
  await tabTo(page, page.getByRole('button', { name: 'Ask another question' }));
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
