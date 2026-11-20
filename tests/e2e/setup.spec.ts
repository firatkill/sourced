// T-90 / R2 Setup 1–4: on a fresh checkout (fixture on 3107, mock mode), the browser goes
// from the printed link to a cited answer without another terminal step.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { SETUP_FIXTURE_TOKEN } from '../fixtures/setup-profile-server-token';

const base = 'http://localhost:3107';

test('T-90: setup link, own documents, cost confirm, indexing, then a cited answer', async ({
  page,
}) => {
  test.setTimeout(120_000);
  // Nothing is indexed: the app sends the browser to setup, which needs the printed link.
  await page.goto(`${base}/`);
  await expect(page).toHaveURL(`${base}/setup`);
  await expect(page.getByRole('heading', { level: 1, name: 'Open your setup link' })).toBeVisible();
  await page.goto(`${base}/setup?token=${'0'.repeat(48)}`);
  await expect(
    page.getByRole('heading', { level: 1, name: 'This setup link has expired' }),
  ).toBeVisible();

  await page.goto(`${base}/setup?token=${SETUP_FIXTURE_TOKEN}`);
  await expect(page).toHaveURL(`${base}/setup`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'What should Sourced answer from?',
  );
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual(
    [],
  );
  await expect(page.getByRole('radio', { name: /My own documents/ })).toBeChecked();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Connect your model provider');
  await expect(page.getByText('Mock mode: no provider is called')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Add your documents');
  await expect(page.getByRole('button', { name: 'Review cost' })).toBeDisabled();
  await page.getByLabel('Choose files').setInputFiles([
    {
      name: 'handbook.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from(
        '# Leave policy\n\nEmployees get 25 days of paid leave a year. Unused days carry over until March.\n',
      ),
    },
    { name: 'budget.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('x') },
  ]);
  await expect(page.getByRole('status').filter({ hasText: 'Added 1.' })).toBeVisible();
  const list = page.getByRole('region', { name: 'Added documents' });
  await expect(list).toContainText('my-docs/');
  await expect(list).toContainText("budget.xlsx · skipped: this type isn't supported");
  await page.getByRole('button', { name: 'Review cost' }).click();

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Index your documents');
  await expect(page.getByText('Nobody (mock mode)')).toBeVisible();
  await expect(page.getByText(/^1 · about \d[\d,]* tokens$/)).toBeVisible();
  await page.getByRole('button', { name: /^Start indexing/ }).click();
  // Indexing runs on the server; mock embeddings make it take a few seconds at most.
  await expect(page.getByRole('heading', { name: 'Your documents are ready' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole('progressbar', { name: 'Indexing progress' })).toHaveAttribute(
    'aria-valuenow',
    '100',
  );
  await page.getByRole('link', { name: 'Start chatting' }).click();

  await expect(page).toHaveURL(`${base}/`);
  await page
    .getByRole('textbox', { name: 'Your question' })
    .fill('How many days of paid leave do employees get?');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: /^Answer ready/ })).toHaveText(
    /^Answer ready with [1-9]\d* verified sources?\.$/,
  );
  await page
    .getByRole('button', { name: /^Source P1:/ })
    .first()
    .click();
  await expect(page.getByRole('complementary', { name: 'Source viewer' })).toContainText(
    '25 days of paid leave',
  );
});

test('T-88: the local app refuses a foreign Host and a cross-site mutation', async ({
  request,
}) => {
  const foreign = await request.get(`${base}/api/health`, {
    headers: { host: 'rebind.example:3107' },
  });
  expect(foreign.status()).toBe(403);
  const cross = await request.post(`${base}/api/setup/data`, {
    headers: { origin: 'http://evil.example', 'content-type': 'application/json' },
    data: { choice: 'own' },
  });
  expect(cross.status()).toBe(403);
  const noCookie = await request.post(`${base}/api/setup/data`, {
    headers: { origin: base, 'content-type': 'application/json' },
    data: { choice: 'own' },
  });
  expect(noCookie.status()).toBe(401);
});
