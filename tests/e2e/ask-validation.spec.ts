// REDESIGN §3–§4, §7: chat turns retain the existing state and accessibility contracts.
import { expect, test } from '@playwright/test';
import { uniqueIp } from './helpers/ip';

// PRD FR-01, §9.3 Validation error; TRD E2E-03.
test('TC-090: invalid input has exact accessible errors and server rejects 600 characters', async ({
  page,
}, testInfo) => {
  await page.setExtraHTTPHeaders({ 'x-real-ip': uniqueIp(testInfo) });
  await page.goto('/');
  const input = page.getByRole('textbox', { name: 'Your question' });
  await input.press('Enter');
  await expect(page.locator('form').getByRole('alert')).toHaveText('Type a question first.');
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await expect(input).toHaveAttribute(
    'aria-describedby',
    'question-counter question-helper question-error',
  );
  await input.fill(testInfo.testId.slice(0, 2));
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.locator('form').getByRole('alert')).toHaveText(
    'That’s too short to search for. Try a full question.',
  );
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  const response = await page.request.post('/api/ask', {
    headers: { Origin: 'http://localhost:3100', 'x-real-ip': uniqueIp(testInfo) },
    data: { question: testInfo.testId.padEnd(600, 'x').slice(0, 600) },
  });
  expect(response.status()).toBe(400);
  const body: unknown = await response.json();
  expect(body).toMatchObject({
    error: { code: 'VALIDATION_FAILED', details: { reason: 'too_long' } },
  });
  await page.route('**/api/ask', (route) => route.fulfill({ status: 400, json: body }));
  await input.fill(testInfo.testId);
  await input.press('Enter');
  await expect(page.locator('form').getByRole('alert')).toHaveText(
    'Questions can be up to 500 characters. Yours is 600.',
  );
  await expect(input).toHaveAttribute('aria-invalid', 'true');
});

// FR-02–FR-04; PRD §9.3 Submitting; TRD §15.6 IME.
test('T-31: suggested chip submits immediately and Stop cancels the pending request', async ({
  page,
}, testInfo) => {
  await page.setExtraHTTPHeaders({ 'x-real-ip': uniqueIp(testInfo) });
  let release: () => void = () => undefined;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/ask', async (route) => {
    await pending;
    await route.abort();
  });
  try {
    await page.goto('/');
    const input = page.getByRole('textbox', { name: 'Your question' });
    await input.fill(testInfo.testId);
    await input.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true });
    await expect(page.getByRole('heading', { name: 'Answer', exact: true })).toHaveCount(0);
    const request = page.waitForRequest('**/api/ask');
    await page
      .getByRole('button', { name: 'When should I use a partial index?', exact: true })
      .click();
    expect((await request).postDataJSON()).toEqual({
      question: 'When should I use a partial index?',
      suggestedId: 'partial',
    });
    await expect(page.locator('#turn-1')).toContainText('When should I use a partial index?');
    await expect(input).toHaveValue('');
    await expect(input).toHaveAttribute('readonly', '');
    await expect(page.getByText('Searching the docs…', { exact: true })).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('Searching the docs');
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(input).not.toHaveAttribute('readonly', '');
    await expect(page.getByRole('button', { name: 'Ask', exact: true })).toBeDisabled();
  } finally {
    release();
    await page.unrouteAll({ behavior: 'wait' });
  }
});
