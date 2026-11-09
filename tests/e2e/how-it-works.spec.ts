import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { uniqueIp } from './helpers';

const privacy =
  'Sourced does not store your questions. For each request it keeps a salted hash of the question, its length, timings, token counts, an estimated cost and how many citations passed or failed. Your IP address is turned into a salted hash that changes every day and is used only to count your daily questions; the IP itself is never stored or logged. There are no cookies, no analytics and no third-party scripts. The question is sent to OpenAI to produce the answer; see OpenAI’s API data usage policy.';

test.beforeEach(async ({ page }, testInfo) => {
  await page.setExtraHTTPHeaders({ 'x-real-ip': uniqueIp(testInfo) });
});

test('TC-136: E2E-22 REDESIGN §6.2 / §7 pipeline, exact copy, sections and limits', async ({
  page,
}) => {
  await page.goto('/how-it-works');
  await expect(page).toHaveTitle('How it works · Sourced');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 1 })).toHaveText('What happens when you ask');
  await expect(main.locator('article > p')).toHaveText(
    'Four steps run on the server for every question. The documentation itself was split, embedded and stored once, ahead of time.',
  );
  const pipeline = main.getByRole('list', { name: 'Pipeline' });
  await expect(pipeline).toHaveJSProperty('tagName', 'OL');
  await expect(pipeline.getByRole('listitem')).toHaveCount(4);
  await expect(pipeline.locator('li > span')).toHaveText([
    '01 · SEARCH',
    '02 · RERANK',
    '03 · WRITE',
    '04 · CHECK',
  ]);
  await expect(pipeline.getByRole('heading', { level: 3 })).toHaveText([
    'Two searches, one list',
    'The model picks six',
    'An answer with receipts',
    'Every quote is verified',
  ]);
  await expect(pipeline.locator('li > p')).toHaveText([
    'Meaning search finds 40 passages, keyword search finds 40. Reciprocal Rank Fusion merges them and keeps the top 20.',
    'The language model orders the 20 by how well they answer your question. If it takes longer than 4 s, the search order is used.',
    'The answer streams from the top 6 passages only. For every claim, the model names its passage and the exact sentence that supports it.',
    'The server looks for each quote in its passage. A citation that fails is removed. If none survive, you get "not in the docs" instead of a guess.',
  ]);
  await expect(main.getByRole('complementary').getByRole('heading', { level: 2 })).toHaveText([
    'Privacy',
    '7. Limits',
  ]);
  await expect(main.getByRole('heading', { level: 2 })).toHaveText([
    '1. Preparing the documents',
    '2. Hybrid search',
    '3. Reranking',
    '4. Writing the answer',
    '5. Checking every citation',
    '6. Measuring quality',
    '8. Cost controls',
    'Privacy',
    '7. Limits',
  ]);
  const limits = main
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: '7. Limits', exact: true }) });
  await expect(limits.getByRole('listitem')).toHaveText([
    /Prompt-only defences against injection are not complete/,
    /quote match proves the words exist in the passage, not that the passage fully supports the sentence.*faithfulness judge/,
    /corpus is 35 pages, not the full PostgreSQL documentation/,
    /first request after a quiet period can be slow because the database scales to zero/,
  ]);
  await expect(main).toContainText('k = 60');
  await expect(main).toContainText('80 tokens of overlap');
});

test('TC-137: E2E-22 FR-48 privacy text and both incoming links', async ({ page }) => {
  for (const source of ['footer', 'input']) {
    await page.goto('/');
    const link =
      source === 'footer'
        ? page.getByRole('contentinfo').getByRole('link', { name: 'Read how this works.' })
        : page.getByRole('link', { name: 'not stored', exact: true });
    await expect(link).toHaveAttribute('href', '/how-it-works#privacy');
    await link.click();
    await expect(page).toHaveURL(/\/how-it-works#privacy$/);
    await expect(page.locator('#privacy h2')).toHaveText('Privacy');
    await expect(page.locator('#privacy p')).toHaveText(privacy);
  }
});

test('TC-138: T-39 copy uses config constants instead of duplicated numbers', async () => {
  for (const path of ['app/how-it-works/page.tsx', 'components/how/PipelineDiagram.tsx']) {
    const source = await readFile(path, 'utf8');
    expect(source).toContain("from '@/lib/config'");
    expect(source.replace(/className="[^"]*"/g, '')).not.toMatch(/\b(40|60|20|500|800|80)\b/);
  }
});

// REDESIGN §6.2: 4 / 2 / 1 columns at the specified breakpoints, both themes.
for (const theme of ['light', 'dark'] as const) {
  test(`R1 pipeline reflows in ${theme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    for (const [width, columns] of [
      [1440, 4],
      [768, 2],
      [360, 1],
    ] as const) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/how-it-works');
      const pipeline = page.getByRole('list', { name: 'Pipeline' });
      expect(
        await pipeline.evaluate(
          (element) => getComputedStyle(element).gridTemplateColumns.split(' ').length,
        ),
      ).toBe(columns);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    }
  });
}
