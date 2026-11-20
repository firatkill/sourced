// T-79 / D-140, D-142: preferences and the exact pre-paint script, without a browser or API.
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
  LEGACY_THEMES,
  parseTheme,
  parseTextSize,
  readTheme,
  readTextSize,
  writeTheme,
  writeTextSize,
  THEMES,
  TEXT_SIZES,
  THEME_SCRIPT,
} from '@/lib/theme';

function storage(values: Record<string, string> = {}) {
  return {
    getItem: (key: string) => values[key] ?? null,
    setItem: (key: string, value: string) => {
      values[key] = value;
    },
  };
}
const denied = {
  getItem: (): string | null => {
    throw new Error('Storage unavailable');
  },
  setItem: (): void => {
    throw new Error('Storage unavailable');
  },
};
describe('T-79 theme mapping and storage', () => {
  it.each(THEMES)('reads %s', (theme) => {
    expect(parseTheme(theme)).toBe(theme);
    expect(readTheme(storage({ 'sourced-theme': theme }))).toBe(theme);
  });
  it.each(Object.entries(LEGACY_THEMES))('maps legacy %s to %s', (legacy, theme) => {
    expect(parseTheme(legacy)).toBe(theme);
    expect(readTheme(storage({ 'sourced-theme': legacy }))).toBe(theme);
  });
  it.each([null, undefined, '', 'unknown', 'constructor', '__proto__'])(
    'defaults invalid %s',
    (value) => {
      expect(parseTheme(value)).toBeUndefined();
      expect(parseTextSize(value)).toBeUndefined();
      expect(readTheme(storage(value == null ? {} : { 'sourced-theme': value }))).toBe('system');
      expect(readTextSize(storage(value == null ? {} : { 'sourced-text-size': value }))).toBe(
        'default',
      );
    },
  );
  it.each(THEMES)('applies and saves %s', (theme) => {
    const root = { dataset: { theme: 'linen' } as { theme?: string } };
    const store = storage();
    writeTheme(theme, root, () => store);
    expect(root.dataset.theme).toBe(theme === 'system' ? undefined : theme);
    expect(readTheme(store)).toBe(theme);
    expect(store.getItem('sourced-theme')).toBe(theme);
  });
  it.each(TEXT_SIZES)('applies and saves text size %s', (size) => {
    const root = { dataset: { textSize: 'large' } as { textSize?: string } };
    const store = storage();
    writeTextSize(size, root, () => store);
    expect(root.dataset.textSize).toBe(size === 'default' ? undefined : size);
    expect(parseTextSize(size)).toBe(size);
    expect(readTextSize(store)).toBe(size);
  });
  it('works when storage reads, writes or access itself throw', () => {
    expect(readTheme(denied)).toBe('system');
    expect(readTextSize(denied)).toBe('default');
    for (const getStorage of [
      () => denied,
      () => {
        throw new Error('Access denied');
      },
    ]) {
      const root = { dataset: {} as { theme?: string; textSize?: string } };
      writeTheme('midnight', root, getStorage);
      writeTextSize('large', root, getStorage);
      expect(root.dataset).toEqual({ theme: 'midnight', textSize: 'large' });
      writeTheme('system', root, getStorage);
      writeTextSize('default', root, getStorage);
      expect(root.dataset).toEqual({});
    }
  });
});
describe('T-79 inline head script', () => {
  for (const theme of [null, ...THEMES, 'light', 'dark', 'unknown', '__proto__', 'constructor']) {
    it.each([null, ...TEXT_SIZES, 'unknown'])(`theme ${String(theme)}, size %s`, (size) => {
      const root = {
        dataset: { theme: 'linen', textSize: 'small' } as { theme?: string; textSize?: string },
      };
      const values: Record<string, string> = {};
      if (theme !== null) values['sourced-theme'] = theme;
      if (size !== null) values['sourced-text-size'] = size;
      runInNewContext(THEME_SCRIPT, {
        document: { documentElement: root },
        localStorage: storage(values),
      });
      const mapped = parseTheme(theme);
      expect(root.dataset.theme).toBe(
        theme === null || mapped === 'system' ? undefined : (mapped ?? 'linen'),
      );
      expect(root.dataset.textSize).toBe(
        size === null || size === 'default' ? undefined : (parseTextSize(size) ?? 'small'),
      );
    });
  }
  it('tolerates blocked and missing storage', () => {
    const root = { dataset: {} };
    expect(() => {
      runInNewContext(THEME_SCRIPT, { document: { documentElement: root }, localStorage: denied });
    }).not.toThrow();
    expect(() => {
      runInNewContext(THEME_SCRIPT, { document: { documentElement: root } });
    }).not.toThrow();
    expect(root.dataset).toEqual({});
  });
});
