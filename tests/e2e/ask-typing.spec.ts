import { expect, test } from '@playwright/test';
import { uniqueIp } from './helpers/ip';

// PRD FR-01, §9.3 Typing; TRD E2E-02.
test('TC-089: counter warns at 450 and the 501st character is blocked', async ({
  page,
}, testInfo) => {
  await page.setExtraHTTPHeaders({ 'x-real-ip': uniqueIp(testInfo) });
  await page.goto('/');
  const input = page.getByRole('textbox', { name: 'Your question' });
  const counter = page.locator('#question-counter');
  await expect(input).toHaveAttribute('maxlength', '500');
  await expect(input).toHaveAttribute('aria-describedby', 'question-counter question-helper');
  await expect(counter).toHaveAttribute('aria-live', 'off');
  await input.fill(' ');
  await expect(page.getByRole('button', { name: 'Ask', exact: true })).toBeDisabled();
  await input.fill(testInfo.testId.slice(0, 1));
  await expect(page.getByRole('button', { name: 'Ask', exact: true })).toBeEnabled();
  const value = testInfo.testId.padEnd(500, 'x').slice(0, 500);
  await input.fill(value.slice(0, 449));
  await expect(counter).toHaveText('449 / 500');
  const normalColor = await counter.evaluate((element) => getComputedStyle(element).color);
  await input.press('End');
  await input.press('x');
  await expect(counter).toHaveText('450 / 500');
  const warnColor = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--warn)';
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });
  await expect(counter).toHaveCSS('color', warnColor);
  expect(normalColor).not.toBe(warnColor);
  await input.fill(value);
  await input.press('End');
  await input.press('x');
  await expect(input).toHaveValue(value);
  await expect(counter).toHaveText('500 / 500');
  await input.fill(testInfo.testId);
  await input.press('End');
  await input.press('Shift+Enter');
  await expect(input).toHaveValue(`${testInfo.testId}\n`);
  await expect(page.getByRole('heading', { name: 'Answer', exact: true })).toHaveCount(0);
});
