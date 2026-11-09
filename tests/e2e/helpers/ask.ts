import { randomUUID } from 'node:crypto';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { uniqueIp } from './ip';

export async function openAsk(page: Page, info: TestInfo, port = 3100) {
  await page.setExtraHTTPHeaders({ 'x-real-ip': uniqueIp(info) });
  await page.goto(`http://localhost:${String(port)}/`);
}

export async function ask(page: Page, trigger = '') {
  const question = `When does a partial index help PostgreSQL queries? ${trigger} ${randomUUID()}`;
  await page.getByRole('textbox', { name: 'Your question' }).fill(question);
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  return question;
}

export async function expectDone(page: Page) {
  await expect(page.getByRole('status').filter({ hasText: /^Answer ready/ })).toHaveText(
    'Answer ready with 2 verified sources.',
  );
  await expect(
    page
      .getByRole('article', { name: 'Answer', exact: true })
      .last()
      .getByRole('button', { name: 'Copy as Markdown', exact: true }),
  ).toBeVisible();
}

export async function liveAnswers(page: Page, count: number) {
  for (let i = 0; i < count; i++) {
    await ask(page);
    await expectDone(page);
  }
}

export async function cachedAnswer(page: Page) {
  await page
    .getByRole('button', { name: 'When should I use a partial index?', exact: true })
    .click();
  await expectDone(page);
  await expect(page.getByText('Answered in advance', { exact: true })).toBeVisible();
}
