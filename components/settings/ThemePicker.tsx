'use client';

import { useSyncExternalStore } from 'react';
import { parseTheme, writeTheme, type Theme } from '@/lib/theme';

const choices: { value: Theme; label: string; detail?: string; colors: string[] }[] = [
  {
    value: 'graphite',
    label: 'Graphite',
    detail: 'dark',
    colors: ['#111317', '#16191e', '#2a2f38', '#9097a3', '#7d9cff'],
  },
  {
    value: 'paper',
    label: 'Paper',
    detail: 'light',
    colors: ['#fafaf8', '#f3f3ef', '#16181d', '#5b616c', '#2155d6'],
  },
  {
    value: 'midnight',
    label: 'Midnight',
    detail: 'dark',
    colors: ['#0b1220', '#0f1a2e', '#1b2c4a', '#8b9bb4', '#4fd1c5'],
  },
  {
    value: 'linen',
    label: 'Linen',
    detail: 'light, warm',
    colors: ['#f6f1e7', '#efe7d8', '#3a2c20', '#6b5a48', '#a3461f'],
  },
  {
    value: 'contrast',
    label: 'High contrast',
    colors: ['#000000', '#0a0a0a', '#1f1f1f', '#d0d0d0', '#ffd60a'],
  },
  {
    value: 'system',
    label: 'Match my system',
    detail: 'Paper by day, Graphite by night',
    colors: ['#fafaf8', '#16191e', '#16181d', '#5b616c', '#2155d6'],
  },
];
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => {
    observer.disconnect();
  };
}
function snapshot() {
  return parseTheme(document.documentElement.dataset.theme) ?? 'system';
}
export function ThemePicker() {
  const selected = useSyncExternalStore(subscribe, snapshot, () => 'system' as const);
  return (
    <fieldset>
      <legend className="mb-4 text-lg font-semibold">Theme</legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {choices.map(({ value, label, detail, colors }) => (
          <label key={value} className="relative cursor-pointer">
            <input
              className="peer absolute top-4 right-4 size-4 accent-[var(--accent)]"
              type="radio"
              name="theme"
              value={value}
              checked={selected === value}
              onChange={() => {
                writeTheme(value, document.documentElement, () => localStorage);
              }}
            />
            <span className="block h-full rounded-[var(--radius)] border border-[var(--rule-strong)] p-4 peer-checked:border-[var(--accent)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--accent)]">
              <span
                aria-hidden="true"
                className="mb-3 flex h-20 overflow-hidden rounded-[var(--radius-sm)]"
                style={{ background: colors[0] }}
              >
                <span className="w-1/5" style={{ background: colors[1] }} />
                <span className="flex flex-1 flex-col gap-2 p-3">
                  <span
                    className="ml-auto h-3 w-1/2 rounded-sm"
                    style={{ background: colors[2] }}
                  />
                  <span className="h-1 w-3/4 rounded-sm" style={{ background: colors[3] }} />
                  <span className="h-1 w-1/2 rounded-sm" style={{ background: colors[3] }} />
                  <span className="size-3 rounded-xs" style={{ background: colors[4] }} />
                </span>
              </span>
              <span className="block font-medium">{label}</span>
              {detail && <span className="block text-sm text-[var(--ink-2)]">{detail}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
