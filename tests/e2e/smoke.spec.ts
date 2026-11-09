import { expect, test } from '@playwright/test';
import { uniqueIp } from './helpers';

for (const port of [3100, 3101, 3102]) {
  test(`TC-015: T-05 mock server ${String(port)} serves the Ask page`, async ({
    page,
  }, testInfo) => {
    await page.setExtraHTTPHeaders({ 'x-real-ip': uniqueIp(testInfo) });
    const response = await page.goto(`http://localhost:${String(port)}`);
    expect(response?.status()).toBe(200);
    // REDESIGN §3 / §7: page-level demo states replace the welcome block.
    if (port === 3100)
      await expect(
        page.getByRole('heading', { name: 'Ask the PostgreSQL docs.', exact: true, level: 1 }),
      ).toBeVisible();
    else if (port === 3101)
      await expect(
        page.getByText(
          'Live answers are paused. The six suggested questions below were answered in advance and still work.',
          { exact: true },
        ),
      ).toBeVisible();
    else
      await expect(
        page.getByRole('heading', { name: 'The demo is offline for maintenance' }),
      ).toBeVisible();
  });
}
