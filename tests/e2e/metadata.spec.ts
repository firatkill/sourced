import { expect, test } from '@playwright/test';
import { uniqueIp } from './helpers';

const pages = [
  { path: '/', title: 'Sourced: answers that show their sources' },
  { path: '/eval', title: 'Evaluation · Sourced' },
  { path: '/how-it-works', title: 'How it works · Sourced' },
];

for (const route of pages) {
  test(`TC-165: ${route.path} has metadata and a working Open Graph image (FR-58)`, async ({
    page,
  }, testInfo) => {
    await page.setExtraHTTPHeaders({ 'x-real-ip': uniqueIp(testInfo) });
    await page.goto(route.path);
    await expect(page).toHaveTitle(route.title);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /\S+/);
    const image = page.locator('meta[property="og:image"]');
    await expect(image).toHaveAttribute('content', /^https?:\/\//);
    const url = await image.getAttribute('content');
    expect(url).not.toBeNull();
    if (!url) throw new Error('Missing Open Graph image URL');
    expect(new URL(url).origin).toBe(new URL(page.url()).origin);
    const response = await page.request.get(url);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toMatch(/^image\//);
  });
}
