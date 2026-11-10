// TC-192 / E2E-26 / FR-62, FR-63. No shared-state mutations; local profile has no quotas.
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { fixtureCopy as copy } from '../fixtures/kit-tr/copy';
import { openAsk, expectDone } from './helpers/ask';

test('TC-192 / E2E-26: Turkish copy and a verified fixture citation', async ({ page }, info) => {
  await openAsk(page, info, 3104);
  await expect(page).toHaveTitle(copy.documentTitle);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy.hero);
  await expect(page.getByText(copy.lead, { exact: true })).toBeVisible();
  // The scope line shares its paragraph with the measurement link, so match it as a substring.
  await expect(page.getByText(copy.scope)).toBeVisible();
  await expect(page.getByPlaceholder(copy.placeholder)).toBeVisible();
  for (const suggestion of copy.suggested) {
    await expect(page.getByRole('button', { name: suggestion.text, exact: true })).toBeVisible();
    await expect(page.getByText(suggestion.topic, { exact: true })).toBeVisible();
  }
  await page
    .getByRole('textbox', { name: 'Your question' })
    .fill(`Saksılar nasıl kaydedilir? ${randomUUID()}`);
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expectDone(page);
  await expect(page.getByPlaceholder(copy.nextPlaceholder)).toBeVisible();
  const answer = page.getByRole('article', { name: 'Answer', exact: true }).last();
  await expect(answer).toContainText('Cep Bahçesi');
  await answer.getByRole('button', { name: /Source P1:/ }).click();
  const viewer = page.getByRole('complementary', { name: 'Source viewer' });
  await expect(viewer.locator('mark').first()).toBeVisible();
  await expect(viewer.getByRole('link', { name: copy.viewerLink })).toHaveAttribute(
    'href',
    /^https:\/\/cep-bahcesi\.example\/(saksilar\.md|sulama\.md|olcum\.html|paylasim\.html)#/,
  );
});
