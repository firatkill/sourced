// T-90 / R2 Setup 1–4: on a fresh checkout (fixture on 3107, mock mode), the browser goes
// from the printed link to a cited answer without another terminal step.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { SETUP_FIXTURE_TOKEN } from '../fixtures/setup-profile-server-token';

const base = 'http://localhost:3107';
// The fixture keeps one checkout: setup runs first, then Settings changes it.
test.describe.configure({ mode: 'serial' });

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

test('T-91: Settings saves a key, switches the answer model and rebuilds for a new embedding model', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto(`${base}/setup?token=${SETUP_FIXTURE_TOKEN}`);
  await page.goto(`${base}/settings`);
  await expect(page.getByRole('heading', { level: 1, name: 'Models and keys' })).toBeVisible();
  const main = page.getByRole('navigation', { name: 'Main', exact: true });
  await expect(main.getByRole('link', { name: 'Settings', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(
    page
      .getByRole('navigation', { name: 'Settings sections' })
      .getByRole('link', { name: 'Models and keys' }),
  ).toHaveAttribute('aria-current', 'page');

  // Mock mode skips the provider call; the key is still written and only shown masked.
  await page.getByLabel('OpenAI API key').fill('sk-test-e2e-key-000000001234');
  await page.getByRole('button', { name: 'Check and save' }).first().click();
  await expect(page.getByText('sk-…1234')).toBeVisible();
  await expect(page.getByText('sk-test-e2e-key-000000001234')).toHaveCount(0);

  await page.getByLabel('Answers').selectOption('openai:gpt-5.4');
  const bar = page.getByRole('region', { name: 'Unsaved changes' });
  await expect(bar).toContainText('1 unsaved change');
  await bar.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved. The next answer uses the new model.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Answers')).toHaveValue('openai:gpt-5.4');

  await page.getByLabel('Search (embeddings)').selectOption('openai:text-embedding-3-large');
  await expect(
    page.getByText(/^The index has to be rebuilt for this model: 1 document,/),
  ).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('button', { name: /^Save and rebuild index/ }).click();
  await expect(page.getByRole('heading', { name: 'Your documents are ready' })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('link', { name: 'Done' }).click();
  await expect(page.getByLabel('Search (embeddings)')).toHaveValue('openai:text-embedding-3-large');
});

test('T-92: Library adds a file and re-indexes; a chat downloads as Markdown; all chats and a source are removed', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto(`${base}/setup?token=${SETUP_FIXTURE_TOKEN}`);
  await page.goto(`${base}/settings/library`);
  await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
  await expect(page.getByText('Files · my-docs · 1 indexed')).toBeVisible();
  await page.getByLabel('Choose files').setInputFiles({
    name: 'remote-work.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# Remote work\n\nStaff may work remotely up to three days a week.\n'),
  });
  await page.getByRole('button', { name: 'Index new documents' }).click();
  await page.getByRole('button', { name: /^Start indexing/ }).click();
  await expect(page.getByRole('heading', { name: 'Your documents are ready' })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('link', { name: 'Done' }).click();
  await expect(page.getByText('Files · my-docs · 2 indexed')).toBeVisible();

  // The chat from the setup test is saved; download it, then delete every chat.
  await page.goto(`${base}/settings/data`);
  await expect(page.getByRole('heading', { level: 1, name: 'Chats and data' })).toBeVisible();
  const link = page.getByRole('link', { name: /^Download .+ as Markdown$/ }).first();
  const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
  expect(download.suggestedFilename()).toMatch(/^how-many-days-of-paid-leave.*\.md$/);
  const text = await (await download.createReadStream()).toArray();
  expect(Buffer.concat(text).toString('utf8')).toContain(
    '## How many days of paid leave do employees get?',
  );
  await page.getByRole('button', { name: 'Delete all chats' }).click();
  const confirm = page.getByRole('group', { name: 'Delete all chats' });
  await expect(confirm).toContainText(/^Delete \d+ chats? and all projects\?/);
  await confirm.getByRole('button', { name: 'Delete all chats' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: /^Deleted \d+ chats?\.$/ }),
  ).toBeVisible();
  await expect(page.getByText('No saved chats.')).toBeVisible();

  await page.goto(`${base}/settings/library`);
  await page.getByRole('button', { name: 'Remove my-docs' }).click();
  await page
    .getByRole('group', { name: 'Remove my-docs' })
    .getByRole('button', { name: 'Remove', exact: true })
    .click();
  await expect(page.getByText('Removed my-docs and 2 indexed documents.')).toBeVisible();
  await expect(page.getByText('No sources yet.', { exact: false })).toBeVisible();
});
