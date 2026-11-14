// TC-238–TC-241 / E2E-27 / FR-90 and NFR-12.
import { expect, test } from '@playwright/test';
import { uniqueIp } from './helpers/ip';
import { ask, expectDone, openAsk } from './helpers/ask';
const token = 'test-access-token-0000000000000000';
const base = 'http://localhost:3105';
test('TC-239 / E2E-27: private access, wrong token, keyboard submit and asking', async ({
  page,
  context,
}, info) => {
  await openAsk(page, info, 3105);
  await expect(page).toHaveURL(`${base}/access`);
  await expect(page).toHaveTitle('Access · Sourced');
  const input = page.getByLabel('Access token', { exact: true });
  await expect(input).toHaveAttribute('type', 'password');
  await input.fill('wrong-token');
  await input.press('Enter');
  await expect(page.getByRole('main').getByRole('alert')).toHaveText('That token is not valid.');
  await input.fill(token);
  await input.press('Tab');
  await expect(page.getByRole('button', { name: 'Continue' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(`${base}/`);
  const cookie = (await context.cookies()).find((item) => item.name === 'sourced_access');
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', secure: false, path: '/' });
  expect(cookie?.value).not.toBe(token);
  await ask(page);
  await expectDone(page);
  await context.clearCookies();
  await ask(page);
  await expect(page).toHaveURL(`${base}/access`);
});
test('TC-239 / E2E-27: unauthenticated API receives 401 with security headers', async ({
  request,
}, info) => {
  const response = await request.post(`${base}/api/ask`, {
    headers: { 'x-real-ip': uniqueIp(info) },
    data: { question: 'When does a partial index help?' },
  });
  expect(response.status()).toBe(401);
  expect(await response.json()).toMatchObject({ error: { code: 'ACCESS_DENIED' } });
  expect(response.headers()['content-security-policy']).toContain("'strict-dynamic'");
});
for (const port of [3100, 3103])
  test(`TC-241: no cookies on public-demo/local routes (${String(port)})`, async ({
    request,
  }, info) => {
    const headers = { 'x-real-ip': uniqueIp(info) };
    for (const path of ['/', '/eval', '/how-it-works', '/access', '/api/health', '/favicon.svg']) {
      const response = await request.get(`http://localhost:${String(port)}${path}`, { headers });
      expect(response.headers()['set-cookie']).toBeUndefined();
      if (path === '/access') expect(response.status()).toBe(404);
    }
    const response = await request.post(`http://localhost:${String(port)}/api/access`, {
      headers,
      form: { token },
    });
    expect(response.status()).toBe(404);
    expect(response.headers()['set-cookie']).toBeUndefined();
    const askResponse = await request.post(`http://localhost:${String(port)}/api/ask`, {
      headers,
      data: { question: 'When should I use a partial index?' },
    });
    expect(askResponse.headers()['set-cookie']).toBeUndefined();
  });
