// T-79 / REDESIGN-v2 §6: contrast is checked against the actual CSS cascade.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('app/globals.css', 'utf8');
function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  expect(start, `Missing token set: ${selector}`).toBeGreaterThanOrEqual(0);
  const block = css.slice(start, css.indexOf('}', start));
  const result: Record<string, string> = {};
  for (const match of block.matchAll(/--([\w-]+):\s*(#[\da-f]{6})/gi)) {
    result[match[1]!] = match[2]!;
  }
  return result;
}
function luminance(hex: string) {
  const linear = [1, 3, 5].map((offset) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
}
const base = tokens(':root');
for (const theme of ['paper', 'graphite', 'midnight', 'linen', 'contrast']) {
  describe(`T-79 ${theme}`, () => {
    const colors = { ...base, ...tokens(`:root[data-theme='${theme}']`) };
    const pairs: [string, string, number][] = [];
    for (const ink of ['ink', 'ink-2', 'ink-3']) {
      for (const background of ['ground', 'rail', 'surface']) pairs.push([ink, background, 4.5]);
    }
    pairs.push(
      ['accent-ink', 'accent', 4.5],
      ['accent-soft-ink', 'accent-soft', 4.5],
      ['user-bubble-ink', 'user-bubble', 4.5],
      ['ink', 'quote', 4.5],
      ['accent', 'ground', 3],
      ['code-ink', 'code-bg', 4.5],
    );
    for (const status of ['ok', 'warn', 'danger']) pairs.push([status, `${status}-soft`, 4.5]);
    for (const token of Object.keys(colors).filter((key) => key.startsWith('sql-'))) {
      pairs.push([token, 'code-bg', 4.5]);
    }
    it.each(pairs)('%s on %s is at least %s:1', (foreground, background, minimum) => {
      expect(colors[foreground]).toMatch(/^#[\da-f]{6}$/i);
      expect(colors[background]).toMatch(/^#[\da-f]{6}$/i);
      const a = luminance(colors[foreground]!);
      const b = luminance(colors[background]!);
      expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThanOrEqual(minimum);
    });
  });
}
