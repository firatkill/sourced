import { expect, test } from '@playwright/test';
import { uniqueIp } from './helpers/ip';

// PRD §9.1–9.3; FR-02, FR-50; TRD E2E-01.
test('TC-088: empty Ask page matches the specified copy', async ({ page }, testInfo) => {
  await page.setExtraHTTPHeaders({ 'x-real-ip': uniqueIp(testInfo) });
  await page.goto('/');
  await expect(page).toHaveTitle('Sourced: answers that show their sources');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Ask the PostgreSQL docs. Every claim shows its source.',
  );
  await expect(
    page.getByText(
      'Answers come only from 35 pages of the PostgreSQL 17 documentation. Each citation is checked against the passage it points to before you see it.',
      { exact: true },
    ),
  ).toBeVisible();
  const input = page.getByRole('textbox', { name: 'Your question' });
  await expect(input).toHaveAttribute('placeholder', 'e.g. When does a partial index help?');
  await expect(input).toHaveValue('');
  await expect(input).not.toBeFocused();
  await expect(page.getByText('0 / 500', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ask', exact: true })).toBeDisabled();
  await expect(
    page.getByText('3 questions per visitor per day. Questions are not stored.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'not stored', exact: true })).toHaveAttribute(
    'href',
    '/how-it-works#privacy',
  );
  const suggestions = page.getByRole('region', { name: 'Try one of these' });
  await expect(suggestions.getByRole('button')).toHaveText([
    'What is the difference between REPEATABLE READ and SERIALIZABLE?',
    'When should I use a partial index?',
    'How do I read the output of EXPLAIN ANALYZE?',
    'Should I store JSON as json or jsonb?',
    'How does row-level security decide which rows a user can see?',
    'Why does VACUUM matter, and what is transaction ID wraparound?',
  ]);
  await expect(page.getByRole('heading', { name: 'Answer', exact: true })).toHaveCount(0);
  await expect(page.getByRole('contentinfo').locator('p')).toHaveText([
    'Built by Fırat Kıl · firatkil.com · Source on GitHub (MIT)',
    'Answers are generated from the PostgreSQL 17 documentation, © The PostgreSQL Global Development Group, used under the PostgreSQL License.',
    'Privacy: questions are not stored. Read how this works.',
  ]);
});
