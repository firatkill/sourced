// T-80 / D-140 / REDESIGN-v2 §3: own-documents copy, library facts and the example banner.
import { expect, test } from '@playwright/test';
import { openAsk } from './helpers/ask';

test('T-80: own documents never show the corpus title or description', async ({ page }, info) => {
  await openAsk(page, info, 3106);
  await expect(
    page.getByRole('heading', { level: 1, name: 'What do you want to know?' }),
  ).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Your question' })).toHaveAttribute(
    'placeholder',
    'Ask about your documents',
  );
  await expect(page.locator('#suggested-heading')).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'About the example' })).toHaveCount(0);
  await expect(
    page.getByText(/^(\d+ documents? · updated .+|No documents indexed yet)$/),
  ).toBeVisible();
  await expect(page.getByText(/^Searching .+/)).toBeVisible();
  await expect(page).toHaveTitle('Sourced');
  for (const path of ['/', '/how-it-works']) {
    await page.goto(`http://localhost:3106${path}`);
    const html = await page.content();
    expect(html, path).not.toContain('My documents');
    expect(html, path).not.toContain('Answers from your own documents');
  }
  await expect(page.getByText(/^Your documents are parsed offline/)).toBeVisible();
  await expect(page.getByText(/^The corpus is /)).toHaveCount(0);
  // T-87: saved chats change the privacy text outside the hosted demo.
  await expect(page.getByText(/^Your chats, with their questions, answers/)).toBeVisible();
  await expect(page.getByText(/^Sourced does not store your questions/)).toHaveCount(0);
});

test('T-80: the example in the local profile explains how to switch, and can be hidden', async ({
  page,
}, info) => {
  await openAsk(page, info, 3103);
  const banner = page.getByRole('complementary', { name: 'About the example' });
  await expect(banner).toContainText("You're trying Sourced with an example");
  await expect(banner.locator('code')).toHaveText([
    'pnpm sourced reset',
    'pnpm sourced add ./my-docs',
  ]);
  await expect(page.locator('#suggested-heading')).toBeVisible();
  await expect(page.getByText(/^\d+ documents? · updated .+$/)).toBeVisible();
  await banner.getByRole('button', { name: 'Hide this notice' }).click();
  await expect(banner).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'About the example' })).toHaveCount(0);
});

test('T-80: the hosted demo keeps its copy and shows no banner or facts', async ({
  page,
}, info) => {
  await openAsk(page, info, 3100);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Ask the PostgreSQL docs.' }),
  ).toBeVisible();
  await expect(
    page.getByText('Answers only from 35 pages of the PostgreSQL 17 docs', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'About the example' })).toHaveCount(0);
  await expect(page.getByText(/ · updated /)).toHaveCount(0);
  await expect(page.getByText(/^Searching /)).toHaveCount(0);
});
