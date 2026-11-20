'use client';

import { useSyncExternalStore } from 'react';
import { parseTextSize, TEXT_SIZES, writeTextSize } from '@/lib/theme';

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-text-size'],
  });
  return () => {
    observer.disconnect();
  };
}
function snapshot() {
  return parseTextSize(document.documentElement.dataset.textSize) ?? 'default';
}
export function TextSize() {
  const selected = useSyncExternalStore(subscribe, snapshot, () => 'default' as const);
  return (
    <fieldset>
      <legend className="mb-4 text-lg font-semibold">Text size</legend>
      <div className="inline-flex flex-wrap gap-1 rounded-[var(--radius)] border border-[var(--rule-strong)] bg-[var(--rail)] p-1">
        {TEXT_SIZES.map((value) => (
          <label key={value} className="relative cursor-pointer">
            <input
              className="peer absolute inset-0 m-0 cursor-pointer appearance-none opacity-0"
              type="radio"
              name="text-size"
              value={value}
              checked={selected === value}
              onChange={() => {
                writeTextSize(value, document.documentElement, () => localStorage);
              }}
            />
            <span className="flex min-h-11 items-center rounded-[var(--radius-sm)] px-5 text-sm text-[var(--ink-2)] peer-checked:bg-[var(--surface)] peer-checked:text-[var(--ink)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--accent)]">
              {value === 'small' ? 'Small' : value === 'large' ? 'Large' : 'Default'}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
