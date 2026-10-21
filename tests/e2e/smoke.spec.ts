import { expect, test } from '@playwright/test';
import { uniqueIp } from './helpers';

for (const port of [3100, 3101, 3102]) {
  test(`TC-015: T-05 mock server ${String(port)} serves the placeholder`, async ({
    page,
  }, testInfo) => {
    await page.setExtraHTTPHeaders({ 'x-real-ip': uniqueIp(testInfo) });
    const response = await page.goto(`http://localhost:${String(port)}`);
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole('heading', { name: 'Sourced', exact: true, level: 1 }),
    ).toBeVisible();
  });
}
