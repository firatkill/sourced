import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { uniqueIp } from './helpers/ip';
import { ask, expectDone, openAsk } from './helpers/ask';
import { routeLongAnswer } from './helpers/long-answer';

// Disabled controls are not tab stops (the Ask button is disabled while the input is empty).
const interactive =
  'a[href], button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]';

test.beforeEach(async ({ page }, info) => {
  await page.setExtraHTTPHeaders({ 'x-real-ip': uniqueIp(info) });
});

async function checkTabRings(page: Page, reduced = false) {
  const elements = page.locator(interactive).filter({ visible: true });
  const count = await elements.count();
  expect(count).toBeGreaterThan(0);
  // Start at the document so every tab stop, including the skip link, is visited.
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.getSelection()?.removeAllRanges();
  });
  const visited = new Set<string>();
  for (let i = 0; i < count + 2; i++) {
    await page.keyboard.press('Tab');
    const result = await page.evaluate(() => {
      const el = document.activeElement;
      if (!(el instanceof HTMLElement) || el === document.body) return null;
      const style = getComputedStyle(el);
      // Resolve the token through a color property to compare computed RGB values.
      const probe = document.createElement('span');
      probe.style.color = 'var(--accent)';
      document.body.append(probe);
      const accent = getComputedStyle(probe).color;
      probe.remove();
      return {
        index: Array.from(document.querySelectorAll('*')).indexOf(el),
        visible: el.matches(':focus-visible'),
        width: style.outlineWidth,
        style: style.outlineStyle,
        offset: style.outlineOffset,
        color: style.outlineColor,
        accent,
        transition: style.transitionDuration,
      };
    });
    if (!result) continue;
    const key = String(result.index);
    if (visited.has(key)) break;
    visited.add(key);
    expect(result.visible).toBe(true);
    expect(result.width).toBe('2px');
    expect(result.style).toBe('solid');
    expect(result.offset).toBe('2px');
    expect(result.color).toBe(result.accent);
    if (reduced) expect(result.transition.split(',').every((v) => parseFloat(v) === 0)).toBe(true);
  }
  expect(visited.size).toBe(count);
}

test('TC-140: long answer code and passage lines scroll within their blocks at 360px', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await routeLongAnswer(page);
  await openAsk(page, info);
  await ask(page);
  await expect(page.getByRole('button', { name: 'Copy answer', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'How this was answered' }).click();
  for (const block of [page.locator('pre'), page.locator('#source-P1 p').last()]) {
    await expect(block).toHaveCSS('overflow-x', 'auto');
    expect(await block.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    expect(
      await block.evaluate((el) => {
        el.scrollLeft = 100;
        return el.scrollLeft;
      }),
    ).toBeGreaterThan(0);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

for (const path of ['/', '/eval', '/how-it-works']) {
  test(`TC-142: every Tab stop has the specified focus ring on ${path}`, async ({ page }) => {
    await page.goto(path);
    await checkTabRings(page);
  });
}

test('TC-143: reduced motion disables smooth scrolling and outline transitions', async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openAsk(page, info);
  await expect(page.locator('html')).toHaveCSS('scroll-behavior', 'auto');
  await checkTabRings(page, true);
  await ask(page);
  await expectDone(page);
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- invoked below with its original element receiver
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (options) {
      document.documentElement.dataset.scrollBehavior =
        typeof options === 'object' ? (options.behavior ?? 'auto') : 'auto';
      original.call(this, options);
    };
  });
  const chip = page.getByRole('button', { name: /^Source P1:/ });
  await chip.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#source-P1')).toBeFocused();
  await expect(page.locator('html')).toHaveAttribute('data-scroll-behavior', /^(auto|instant)$/);
});

for (const state of ['/', 'done', '/eval', '/how-it-works']) {
  test(`TC-144: touch targets meet minimum size or spacing at 360px on ${state}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await openAsk(page, info);
    if (state === 'done') {
      await ask(page);
      await expectDone(page);
    } else if (state !== '/') await page.goto(state);
    const targets = page.locator(interactive).filter({ visible: true });
    const sizes = await targets.evaluateAll((elements) =>
      elements.map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          name: el.getAttribute('aria-label') ?? el.textContent,
          width: rect.width,
          height: rect.height,
        };
      }),
    );
    expect(sizes.length).toBeGreaterThan(0);
    // Smaller inline links are permitted only when axe verifies the WCAG exception.
    const undersized = sizes.filter(({ width, height }) => width < 24 || height < 24);
    const result = await new AxeBuilder({ page }).withRules(['target-size']).analyze();
    expect(result.incomplete, JSON.stringify(undersized)).toEqual([]);
    expect(result.violations, JSON.stringify(undersized)).toEqual([]);
  });
}
