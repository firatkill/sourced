// T-83 / D-142 / REDESIGN-v2 §7: saved chats in the sidebar (local profile fixture on 3103).
import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectDone, openAsk } from './helpers/ask';

const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Main', exact: true });
const chatLink = (page: Page, title: string) =>
  sidebar(page).getByRole('link', { name: title, exact: true });

async function newChat(page: Page, info: Parameters<typeof openAsk>[1]) {
  await openAsk(page, info, 3103);
  const question = `When does a partial index help ${randomUUID().slice(0, 8)}?`;
  await page.getByRole('textbox', { name: 'Your question' }).fill(question);
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expectDone(page);
  await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}$/);
  await expect(chatLink(page, question)).toBeVisible();
  return question;
}
async function openMenu(page: Page, title: string) {
  await sidebar(page)
    .getByRole('button', { name: `Options for ${title}`, exact: true })
    .click();
  return page.getByRole('menu');
}

test('T-83: the first question creates a saved chat that survives a reload', async ({
  page,
}, info) => {
  const question = await newChat(page, info);
  await expect(chatLink(page, question)).toHaveAttribute('aria-current', 'page');
  await page.reload();
  await expect(chatLink(page, question)).toBeVisible();
  await expect(page.getByText('Chats are saved on this computer.')).toBeVisible();
  await expect(page.getByText('Kept in this tab only', { exact: false })).toHaveCount(0);
});

test('T-83: rename inline, then Escape cancels a second rename', async ({ page }, info) => {
  const question = await newChat(page, info);
  const title = `Renamed ${randomUUID().slice(0, 8)}`;
  await (await openMenu(page, question)).getByRole('menuitem', { name: 'Rename' }).click();
  const input = sidebar(page).getByRole('textbox', { name: 'Chat name' });
  await input.fill(title);
  await input.press('Enter');
  await expect(chatLink(page, title)).toBeVisible();
  await page.reload();
  await expect(chatLink(page, title)).toBeVisible();
  await (await openMenu(page, title)).getByRole('menuitem', { name: 'Rename' }).click();
  await sidebar(page).getByRole('textbox', { name: 'Chat name' }).fill('Not saved');
  await sidebar(page).getByRole('textbox', { name: 'Chat name' }).press('Escape');
  await expect(chatLink(page, title)).toBeVisible();
});

/**
 * HTML5 drag and drop with one shared DataTransfer: the events the browser sends, without
 * mouse moves that scroll a long sidebar mid-drag.
 */
async function drag(page: Page, source: Locator, target: Locator) {
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await source.dispatchEvent('dragstart', { dataTransfer });
  await target.dispatchEvent('dragover', { dataTransfer });
  await target.dispatchEvent('drop', { dataTransfer });
  await source.dispatchEvent('dragend', { dataTransfer });
}

async function newProject(page: Page) {
  const project = `Project ${randomUUID().slice(0, 8)}`;
  await sidebar(page).getByRole('button', { name: 'New project', exact: true }).click();
  const name = sidebar(page).getByRole('textbox', { name: 'Project name' });
  await name.fill(project);
  await name.press('Enter');
  const header = sidebar(page).getByRole('button', { name: project, exact: true });
  await expect(header).toHaveAttribute('aria-expanded', 'true');
  const group = sidebar(page)
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: project, exact: true }) });
  await expect(group).toContainText('No chats yet. Drag a chat here.');
  return { project, header, group };
}

test('D-153: a project is a folder among the chats; its menu opens the project settings', async ({
  page,
}, info) => {
  const question = await newChat(page, info);
  const { project, header, group } = await newProject(page);
  const menu = await openMenu(page, question);
  await menu.getByRole('menuitem', { name: 'Move to project' }).click();
  await page.getByRole('menuitemradio', { name: project }).click();
  await expect(group.getByRole('link', { name: question, exact: true })).toBeVisible();
  // Closing the folder hides its chats; it stays closed after a reload.
  await header.click();
  await expect(header).toHaveAttribute('aria-expanded', 'false');
  await expect(chatLink(page, question)).toHaveCount(0);
  await page.reload();
  await expect(header).toHaveAttribute('aria-expanded', 'false');
  await header.click();
  await expect(chatLink(page, question)).toBeVisible();

  const options = await openMenu(page, project);
  await expect(options.getByRole('menuitem', { name: 'New chat in this project' })).toBeFocused();
  await options.getByRole('menuitem', { name: 'Project settings' }).click();
  await expect(page).toHaveURL(/\/p\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1, name: project })).toBeVisible();
  await expect(
    page.getByRole('main').getByRole('link', { name: new RegExp(question.slice(0, 20)) }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'New chat in this project' })).toHaveAttribute(
    'href',
    /\/\?project=/,
  );
});

test('D-153: drag a chat into a project and back out to Chats', async ({ page }, info) => {
  const question = await newChat(page, info);
  const { header, group } = await newProject(page);
  await drag(page, chatLink(page, question), header);
  await expect(group.getByRole('link', { name: question, exact: true })).toBeVisible();
  await drag(
    page,
    chatLink(page, question),
    sidebar(page).getByRole('heading', { name: 'Chats', exact: true }),
  );
  await expect(group.getByRole('link', { name: question, exact: true })).toHaveCount(0);
  await expect(
    sidebar(page)
      .getByRole('region', { name: 'Chats', exact: true })
      .getByRole('link', { name: question, exact: true }),
  ).toBeVisible();
});

test('D-153: Reset all data asks what to remove before it resets', async ({ page }, info) => {
  await openAsk(page, info, 3103);
  let sent: unknown = null;
  // The fixture server is shared by parallel tests, so the reset itself is answered here.
  await page.route('**/api/setup/reset', async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ json: { removedSources: 1, removedDocuments: 3, removedChats: 0 } });
  });
  await sidebar(page).getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Reset all data…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Reset all data?' });
  await expect(dialog.getByRole('radio', { name: /^Reset the library/ })).toBeChecked();
  await expect(dialog.getByRole('button', { name: 'Reset the library' })).toBeVisible();
  await dialog.getByRole('radio', { name: /^Remove everything/ }).check();
  await dialog.getByRole('button', { name: 'Remove everything' }).click();
  await expect.poll(() => sent).toEqual({ scope: 'everything' });
  await expect(page).toHaveURL(/:3103\/$/);
});

test('T-83: delete asks for confirmation and removes the chat', async ({ page }, info) => {
  const question = await newChat(page, info);
  await (await openMenu(page, question)).getByRole('menuitem', { name: 'Delete' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete this chat?' });
  await expect(dialog).toContainText(question);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(chatLink(page, question)).toBeVisible();
  await (await openMenu(page, question)).getByRole('menuitem', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(chatLink(page, question)).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
});

test('T-83: the options menu works from the keyboard', async ({ page }, info) => {
  const question = await newChat(page, info);
  const trigger = sidebar(page).getByRole('button', { name: `Options for ${question}` });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem', { name: 'Rename' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: 'Move to project' })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(menu.getByRole('menuitem', { name: 'Delete' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('T-83: the sidebar with saved chats has no serious accessibility violations', async ({
  page,
}, info) => {
  await newChat(page, info);
  // Menu closed: an open popover covers the rows below it by design. Same rule set as E2E-17 (a11y.spec.ts).
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
  ).toEqual([]);
});

test('T-83: the hosted demo keeps the tab-only session list', async ({ page }, info) => {
  await openAsk(page, info, 3100);
  await expect(page.getByText('Kept in this tab only', { exact: false })).toBeVisible();
  await expect(sidebar(page).getByRole('button', { name: 'New project' })).toHaveCount(0);
  expect((await page.request.get('http://localhost:3100/api/chats')).status()).toBe(404);
});

test('T-84: a saved chat reopens with its answer and sources', async ({ page }, info) => {
  const question = await newChat(page, info);
  const url = page.url();
  const answer = await page
    .getByRole('article', { name: 'Answer', exact: true })
    .last()
    .innerText();
  await page.goto('http://localhost:3103/');
  await page.goto(url);
  await expect(page.getByText(question, { exact: true }).first()).toBeVisible();
  const restored = page.getByRole('article', { name: 'Answer', exact: true }).last();
  await expect(restored).toBeVisible();
  expect(await restored.innerText()).toBe(answer);
  await restored
    .getByRole('button', { name: /^Source P1:/ })
    .first()
    .click();
  await expect(page.getByRole('complementary', { name: 'Source viewer' })).toBeVisible();
});

test('T-84: a cited file that left the library shows the saved copy note', async ({
  page,
}, info) => {
  const { meta, citations, done, passage } = await import('../fixtures/sse-streams');
  const content = 'A partial index is an index built over a subset of a table.';
  await page.route('**/api/ask', async (route) => {
    const events = [
      {
        event: 'meta',
        data: {
          ...meta,
          passages: [
            {
              ...passage,
              chunkId: '987654321',
              officialUrl: null,
              filePath: 'gone.pdf',
              pageFrom: 3,
              pageTo: 3,
              content,
            },
          ],
        },
      },
      { event: 'token', data: { delta: citations.answer } },
      { event: 'citations', data: citations },
      { event: 'done', data: done },
    ];
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
      body: events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`).join(''),
    });
  });
  await openAsk(page, info, 3103);
  await page.getByRole('textbox', { name: 'Your question' }).fill(`File question ${randomUUID()}`);
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await page
    .getByRole('button', { name: /^Source P1:/ })
    .first()
    .click();
  await expect(
    page.getByRole('note').filter({ hasText: 'no longer in your library' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: /^Open at page 3/ })).toHaveCount(0);
});

test('T-85: a follow-up is searched as a standalone question, also after a reload', async ({
  page,
}, info) => {
  const first = await newChat(page, info);
  await expect(page.getByRole('textbox', { name: 'Your question' })).toHaveAttribute(
    'placeholder',
    /Ask a follow-up|Ask another question/,
  );
  await page.getByRole('textbox', { name: 'Your question' }).fill('Can it also be unique?');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  const searched = page.getByText('Searched for:', { exact: false });
  await expect(searched).toHaveCount(1);
  await expect(searched).toContainText(`${first} Can it also be unique?`);
  await expect(page.getByRole('article', { name: 'Answer', exact: true })).toHaveCount(2);
  // The server saves a turn right after its stream ends; wait for it before reloading.
  const id = /\/c\/([0-9a-f-]{36})$/.exec(page.url())?.[1] ?? '';
  await expect
    .poll(async () => {
      const body = (await (
        await page.request.get(`http://localhost:3103/api/chats/${id}`)
      ).json()) as {
        chat: { turns: unknown[] };
      };
      return body.chat.turns.length;
    })
    .toBe(2);
  await page.reload();
  await expect(page.getByText('Searched for:', { exact: false })).toContainText(
    'Can it also be unique?',
  );
});
