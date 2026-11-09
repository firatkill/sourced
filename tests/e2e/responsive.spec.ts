import { expect, test } from '@playwright/test';
import { ask, openAsk, expectDone } from './helpers/ask';

for (const viewport of [
  { width: 360, height: 740 },
  { width: 1024, height: 768 },
  { width: 1920, height: 1080 },
]) {
  test(`TC-109 / TC-141: E2E-19 responsive pages at ${String(viewport.width)}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    await openAsk(page, info);
    const noOverflow = async () => {
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
          ),
        )
        .toBe(true);
    };
    await noOverflow();
    await ask(page);
    await expectDone(page);
    await page.getByRole('button', { name: 'How this was answered' }).click();
    await noOverflow();
    if (viewport.width === 360) {
      const sources = await page
        .getByRole('region', { name: 'Sources', exact: true })
        .boundingBox();
      const disclosure = await page
        .getByRole('table', { name: 'Passages ranked for this answer' })
        .boundingBox();
      expect(sources).not.toBeNull();
      expect(disclosure).not.toBeNull();
      expect(sources!.y).toBeGreaterThanOrEqual(disclosure!.y + disclosure!.height);
    }
    for (const path of ['/eval', '/how-it-works', '/does-not-exist']) {
      await page.goto(path);
      await noOverflow();
    }
  });
}
