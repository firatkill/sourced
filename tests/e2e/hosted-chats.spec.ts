// D-154: the hosted demo (3100) has the same sidebar as the local app; chats live in the tab.
import { randomUUID } from 'node:crypto';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectDone, openAsk } from './helpers/ask';

const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Main', exact: true });
const chatLinks = (page: Page) => sidebar(page).getByRole('link', { name: /^When does/ });

async function newChat(page: Page, info: Parameters<typeof openAsk>[1]) {
  await openAsk(page, info, 3100);
  const question = `When does a BRIN index help ${randomUUID().slice(0, 8)}?`;
  const request = page.waitForRequest('**/api/ask');
  await page.getByRole('textbox', { name: 'Your question' }).fill(question);
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  // The server never sees a chat id: nothing about the chat is stored there.
  expect((await request).postDataJSON()).toEqual({ question });
  await expectDone(page);
  await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}$/);
  const link = sidebar(page).getByRole('link', { name: question, exact: true });
  await expect(link).toHaveAttribute('aria-current', 'page');
  return { question, link };
}

async function drag(page: Page, source: Locator, target: Locator) {
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await source.dispatchEvent('dragstart', { dataTransfer });
  await target.dispatchEvent('dragover', { dataTransfer });
  await target.dispatchEvent('drop', { dataTransfer });
  await source.dispatchEvent('dragend', { dataTransfer });
}

test('D-154: a hosted chat is kept in the tab, survives a reload and is not on the server', async ({
  page,
  context,
}, info) => {
  const { question } = await newChat(page, info);
  const url = page.url();
  const answer = await page.getByRole('article', { name: 'Answer', exact: true }).innerText();
  await expect(
    sidebar(page).getByText('Chats are kept in this browser tab and are gone when you close it.'),
  ).toBeVisible();
  await expect(page.getByRole('contentinfo')).toContainText(
    'Privacy: chats stay in this browser tab; the server does not store them.',
  );
  expect((await page.request.get('http://localhost:3100/api/chats')).status()).toBe(404);

  await page.reload();
  await expect(sidebar(page).getByRole('link', { name: question, exact: true })).toBeVisible();
  const restored = page.getByRole('article', { name: 'Answer', exact: true });
  await expect(
    restored.getByRole('button', { name: 'Copy as Markdown', exact: true }),
  ).toBeVisible();
  expect(await restored.innerText()).toBe(answer);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(0);

  // Another tab has its own storage, so the link opens a fresh chat there.
  const other = await context.newPage();
  await other.goto(url);
  await expect(other.getByRole('heading', { level: 1 })).toHaveText('Ask the PostgreSQL docs.');
  await expect(other).toHaveURL('http://localhost:3100/');
  await expect(chatLinks(other)).toHaveCount(0);
  await other.close();
});

test('D-154: hosted projects are folders; drag a chat in, open settings, delete', async ({
  page,
}, info) => {
  const { question, link } = await newChat(page, info);
  const project = `Project ${randomUUID().slice(0, 8)}`;
  await sidebar(page).getByRole('button', { name: 'New project', exact: true }).click();
  const name = sidebar(page).getByRole('textbox', { name: 'Project name' });
  await name.fill(project);
  await name.press('Enter');
  const group = sidebar(page)
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: project, exact: true }) });
  await expect(group).toContainText('No chats yet. Drag a chat here.');

  await drag(page, link, group);
  await expect(group.getByRole('link', { name: question, exact: true })).toBeVisible();
  await page.reload();
  await expect(group.getByRole('link', { name: question, exact: true })).toBeVisible();

  await sidebar(page)
    .getByRole('button', { name: `Options for ${project}`, exact: true })
    .click();
  await page.getByRole('menuitem', { name: 'Project settings' }).click();
  await expect(page).toHaveURL(/\/p\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1, name: project })).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: question })).toBeVisible();
  // The demo searches one fixed library, so there is no source choice.
  await expect(page.getByRole('heading', { name: 'Search in' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Delete project', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete project' }).click();
  await expect(page).toHaveURL('http://localhost:3100/');
  await expect(sidebar(page).getByRole('button', { name: project, exact: true })).toHaveCount(0);
  await expect(
    sidebar(page)
      .getByRole('region', { name: 'Chats' })
      .getByRole('link', { name: question, exact: true }),
  ).toBeVisible();
});
