// REDESIGN §3–§4, §7: chat turns retain the existing state and accessibility contracts.
import { expect, test } from '@playwright/test';
import { uniqueIp } from './helpers/ip';

// PRD §9.1–9.3; FR-02, FR-50; TRD E2E-01.
test('TC-088: empty Ask page matches the specified copy', async ({ page }, testInfo) => {
  await page.setExtraHTTPHeaders({ 'x-real-ip': uniqueIp(testInfo) });
  await page.goto('/');
  await expect(page).toHaveTitle('Sourced: answers that show their sources');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ask the PostgreSQL docs.');
  await expect(
    page.getByText(
      'Get a direct answer with working SQL. Every sentence links to the passage it comes from, and every quote is checked before you see it.',
      { exact: true },
    ),
  ).toBeVisible();
  const input = page.getByRole('textbox', { name: 'Your question' });
  await expect(input).toHaveAttribute(
    'placeholder',
    'e.g. How do I find slow queries with EXPLAIN ANALYZE?',
  );
  await expect(input).toHaveValue('');
  await expect(input).not.toBeFocused();
  await expect(page.getByText('0 / 500', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ask', exact: true })).toBeDisabled();
  await expect(
    page.getByText(
      '3 questions per visitor per day. Suggested questions are answered instantly and do not count.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'See how it is measured' })).toHaveAttribute(
    'href',
    '/eval',
  );
  const suggestions = page.getByRole('region', { name: 'Start with one of these' });
  await expect(suggestions.getByRole('button')).toHaveText([
    'TransactionsWhat is the difference between REPEATABLE READ and SERIALIZABLE?',
    'IndexesWhen should I use a partial index?',
    'PerformanceHow do I read the output of EXPLAIN ANALYZE?',
    'Data typesShould I store JSON as json or jsonb?',
    'SecurityHow does row-level security decide which rows a user can see?',
    'MaintenanceWhy does VACUUM matter, and what is transaction ID wraparound?',
  ]);
  await expect(page.getByRole('article', { name: 'Answer' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'New chat' })).toBeEnabled();
  await expect(
    page.getByText(
      'Kept in this tab only. Reload or close it and the chat is gone; nothing is stored on the server.',
    ),
  ).toBeVisible();
  await expect(page.getByRole('contentinfo').locator('p')).toHaveText([
    'Built by Fırat Kıl · firatkil.com · Source on GitHub (MIT)',
    'Answers are generated from the PostgreSQL 17 documentation, © The PostgreSQL Global Development Group, used under the PostgreSQL License.',
    'Privacy: questions are not stored. Read how this works.',
  ]);
});
