/** Browser-only appearance preferences (T-79, D-140/D-142). No server state. */
export const THEMES = ['graphite', 'paper', 'midnight', 'linen', 'contrast', 'system'] as const;
export type Theme = (typeof THEMES)[number];
export const TEXT_SIZES = ['small', 'default', 'large'] as const;
export type TextSize = (typeof TEXT_SIZES)[number];
export const THEME_KEY = 'sourced-theme';
export const TEXT_SIZE_KEY = 'sourced-text-size';
export const LEGACY_THEMES = { light: 'paper', dark: 'graphite' } as const;

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;
type AppearanceRoot = { dataset: { theme?: string; textSize?: string } };

export function parseTheme(value: string | null | undefined): Theme | undefined {
  if (value === 'light' || value === 'dark') return LEGACY_THEMES[value];
  return THEMES.find((theme) => theme === value);
}
export function parseTextSize(value: string | null | undefined): TextSize | undefined {
  return TEXT_SIZES.find((size) => size === value);
}
export function readTheme(storage: Pick<PreferenceStorage, 'getItem'>): Theme {
  try {
    return parseTheme(storage.getItem(THEME_KEY)) ?? 'system';
  } catch {
    return 'system';
  }
}
export function readTextSize(storage: Pick<PreferenceStorage, 'getItem'>): TextSize {
  try {
    return parseTextSize(storage.getItem(TEXT_SIZE_KEY)) ?? 'default';
  } catch {
    return 'default';
  }
}
export function writeTheme(theme: Theme, root: AppearanceRoot, storage: () => PreferenceStorage) {
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
  try {
    storage().setItem(THEME_KEY, theme);
  } catch {
    // Applying a preference does not depend on storage access.
  }
}
export function writeTextSize(
  size: TextSize,
  root: AppearanceRoot,
  storage: () => PreferenceStorage,
) {
  if (size === 'default') delete root.dataset.textSize;
  else root.dataset.textSize = size;
  try {
    storage().setItem(TEXT_SIZE_KEY, size);
  } catch {
    // Applying a preference does not depend on storage access.
  }
}

// Constant pre-paint script: shared values are serialized, never user input.
export const THEME_SCRIPT = `try {
  const root = document.documentElement;
  const stored = localStorage.getItem('${THEME_KEY}');
  const legacy = ${JSON.stringify(LEGACY_THEMES)};
  const theme = Object.prototype.hasOwnProperty.call(legacy, stored) ? legacy[stored] : stored;
  if (theme === null || theme === 'system') delete root.dataset.theme;
  else if (${JSON.stringify(THEMES)}.includes(theme)) root.dataset.theme = theme;
} catch {}
try {
  const root = document.documentElement;
  const size = localStorage.getItem('${TEXT_SIZE_KEY}');
  if (size === 'small' || size === 'large') root.dataset.textSize = size;
  else if (size === null || size === 'default') delete root.dataset.textSize;
} catch {}`;
