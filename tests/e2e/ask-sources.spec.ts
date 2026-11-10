import { expect, test } from '@playwright/test';
import { completeAnswer } from './helpers/answer';

// REDESIGN §3.3 (line 64), §4.3–5 (lines 76–78), §7 viewer copy.
for (const theme of ['light', 'dark'] as const) {
  for (const width of [390, 768, 1440]) {
    test(`TC-092 / R2: ${theme} ${String(width)}px source viewer, cards and focus return`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 844 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      const fixture = await completeAnswer(page, info);
      const cards = page.getByRole('region', { name: 'Sources', exact: true });
      await expect(cards.getByRole('button')).toHaveCount(fixture.citations.valid.length);
      const viewer = page.getByRole(width >= 1024 ? 'complementary' : 'dialog', {
        name: 'Source viewer',
      });
      for (const [index, citation] of fixture.citations.valid.entries()) {
        const passage = fixture.meta.passages.find((item) => item.label === citation.label)!;
        const chip = page.getByRole('button', {
          name: `Source ${citation.label}: ${passage.documentTitle}, ${passage.headingPath.at(-1)!}`,
        });
        await expect(chip).toHaveText(citation.label.slice(1));
        await chip.focus();
        await chip.press('Enter');
        await expect(viewer).toBeVisible();
        await expect(viewer).toContainText(
          `Source ${String(index + 1)} of ${String(fixture.citations.valid.length)}`,
        );
        await expect(cards.getByRole('button').nth(index)).toHaveAttribute('aria-current', 'true');
        await expect(viewer.locator('mark')).toHaveText(
          passage.content.slice(citation.quoteSpan.start, citation.quoteSpan.end).split(/\n\s*\n/),
        );
        for (const mark of await viewer.locator('mark').all()) {
          await expect(mark).toHaveAttribute('aria-description', 'Supporting quote');
        }
        await expect(
          viewer.getByText('Highlighted: the sentence the answer quotes.', { exact: true }),
        ).toBeVisible();
        const link = viewer.getByRole('link', {
          name: 'Open on postgresql.org (opens in a new tab)',
        });
        if (passage.officialUrl === null) throw new Error('Expected a web-source URL');
        await expect(link).toHaveAttribute('href', passage.officialUrl);
        await expect(link).toHaveAttribute('target', '_blank');
        await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
        if (width < 1024) {
          for (let step = 0; step < 8; step++) {
            await page.keyboard.press('Tab');
            expect(await viewer.evaluate((el) => el.contains(document.activeElement))).toBe(true);
          }
          const box = await viewer.boundingBox();
          expect(box!.y + box!.height).toBeCloseTo(844, 0);
        }
        await page.keyboard.press('Escape');
        await expect(viewer).toHaveCount(0);
        await expect(chip).toBeFocused();
      }
      const first = cards.getByRole('button').first();
      await first.click();
      await expect(viewer).toContainText('Source 1 of 2');
      await expect(viewer.getByRole('button', { name: 'Previous source' })).toBeDisabled();
      await viewer.getByRole('button', { name: 'Next source' }).click();
      await expect(viewer).toContainText('Source 2 of 2');
      await expect(viewer.getByRole('button', { name: 'Next source' })).toBeDisabled();
      await viewer.getByRole('button', { name: 'Previous source' }).click();
      await expect(viewer).toContainText('Source 1 of 2');
      await viewer.getByRole('button', { name: 'Close source viewer' }).click();
      await expect(first).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    });
  }
}
