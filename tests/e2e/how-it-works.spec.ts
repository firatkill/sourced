import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { uniqueIp } from './helpers';

const privacy =
  'Sourced does not store your questions. For each request it keeps a salted hash of the question, its length, timings, token counts, an estimated cost and how many citations passed or failed. Your IP address is turned into a salted hash that changes every day and is used only to count your daily questions; the IP itself is never stored or logged. There are no cookies, no analytics and no third-party scripts. The question is sent to OpenAI to produce the answer; see OpenAI’s API data usage policy.';

test.beforeEach(async ({ page }, testInfo) => {
  await page.setExtraHTTPHeaders({ 'x-real-ip': uniqueIp(testInfo) });
});

test('TC-136: E2E-22 PRD §9.6 diagram, exact copy, sections and limits', async ({ page }) => {
  await page.goto('/how-it-works');
  await expect(page).toHaveTitle('How it works · Sourced');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 1 })).toHaveText(
    'How Sourced answers a question',
  );
  await expect(main.locator('article > p')).toHaveText(
    'A question goes through four steps on the server: hybrid search, reranking, generation with citations, and citation checking. The documents were prepared once, offline.',
  );
  const request = main.getByRole('list', { name: 'Request path' });
  const offline = main.getByRole('list', { name: 'Offline ingestion' });
  await expect(request.locator('li > span')).toHaveText([
    'Question',
    'Embed',
    'Vector search (top 40)',
    'Keyword search (top 40)',
    'Reciprocal Rank Fusion (top 20)',
    'Rerank (top 6)',
    'Generate with [P#] citations',
    'Verify quotes',
    'Answer',
  ]);
  await expect(offline.locator('li > span')).toHaveText([
    '35 doc pages',
    'Parse',
    'Chunk (500–800 tokens)',
    'Embed',
    'Postgres + pgvector',
  ]);
  await expect(main.locator('figure > ol')).toHaveCount(2);
  await expect(main.locator('figure > ol').nth(0)).toHaveAttribute('aria-label', 'Request path');
  await expect(main.locator('figure > ol').nth(1)).toHaveAttribute(
    'aria-label',
    'Offline ingestion',
  );
  await expect(main.locator('figcaption')).toHaveText(
    'Request path above, offline ingestion below.',
  );
  await expect(main.getByRole('heading', { level: 2 })).toHaveText([
    '1. Preparing the documents',
    '2. Hybrid search',
    '3. Reranking',
    '4. Writing the answer',
    '5. Checking every citation',
    '6. Measuring quality',
    '7. Limits',
    '8. Cost controls',
    'Privacy',
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
