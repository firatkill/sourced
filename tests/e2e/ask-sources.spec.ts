import { expect, test } from '@playwright/test';
import { completeAnswer } from './helpers/answer';

for (const mode of ['desktop', 'mobile'] as const) {
  test(`TC-092: ${mode} chips focus sources, UTF-16 quote, official links and uncited ordering`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: mode === 'mobile' ? 375 : 1440, height: 900 });
    await page.emulateMedia({
      reducedMotion: 'reduce',
      colorScheme: mode === 'mobile' ? 'dark' : 'light',
    });
    const fixture = await completeAnswer(page, testInfo);
    const panel = page.getByRole('region', { name: 'Sources', exact: true });
    await expect(panel.locator('article').first()).toHaveAttribute('tabindex', '-1');
    expect(
      await panel.locator('article').evaluateAll((cards) => cards.map((card) => card.id)),
    ).toEqual(['source-P1', 'source-P2', 'source-P3', 'source-P4', 'source-P5', 'source-P6']);
    for (const citation of fixture.citations.valid) {
      const passage = fixture.meta.passages.find((item) => item.label === citation.label)!;
      const chip = page.getByRole('button', {
        name: `Source ${citation.label}: ${passage.documentTitle}, ${passage.headingPath.at(-1)!}`,
      });
      await chip.focus();
      await chip.press('Enter');
      const card = page.locator(`#source-${citation.label}`);
      await expect(card).toBeFocused();
      await expect(card).toBeInViewport();
      const fragments = passage.content
        .slice(citation.quoteSpan.start, citation.quoteSpan.end)
        .split(/\n\s*\n/);
      await expect(card.locator('mark')).toHaveText(fragments);
      expect(
        (await card.locator('mark').allTextContents())
          .join(' ')
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .trim(),
      ).toBe(citation.quote.toLowerCase().replace(/\s+/g, ' ').trim());
      for (const mark of await card.locator('mark').all()) {
        await expect(mark).toHaveAttribute('aria-description', 'Supporting quote');
      }
      const link = card.getByRole('link', {
        name: `Read in the PostgreSQL docs: ${passage.documentTitle}`,
      });
      await expect(link).toHaveAttribute('href', passage.officialUrl);
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
    for (const label of ['P3', 'P4', 'P5', 'P6']) {
      await expect(
        page.locator(`#source-${label}`).getByText('Retrieved, not cited'),
      ).toBeVisible();
      await expect(page.locator(`#source-${label} mark`)).toHaveCount(0);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
}
