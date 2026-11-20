'use client';

import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { Library, X } from 'lucide-react';
import { ASK_COPY } from '@/lib/copy';

const KEY = 'sourced-example-banner';
const listeners = new Set<() => void>();
let dismissed = false; // Hides the banner for this page even when storage is blocked.
function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}
function hidden() {
  if (dismissed) return true;
  try {
    return localStorage.getItem(KEY) === 'hidden';
  } catch {
    return false;
  }
}

/**
 * REDESIGN-v2 §3.2 / D-151: in the local profile, the bundled example points to Settings › Library,
 * where a browser user adds documents and removes the example.
 */
export function ExampleBanner({ notice }: { notice: string }) {
  const isHidden = useSyncExternalStore(subscribe, hidden, () => false);
  if (isHidden) return null;
  return (
    <aside
      aria-label={ASK_COPY.exampleBannerLabel}
      className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--rule-strong)] bg-[var(--accent-soft)] p-3 pl-4 text-sm text-[var(--accent-soft-ink)]"
    >
      <Library size={20} aria-hidden="true" className="shrink-0" />
      <p className="min-w-0 flex-[1_1_320px]">
        <strong className="font-semibold">{notice}</strong> {ASK_COPY.exampleBannerBefore}
      </p>
      <Link
        href="/settings/library"
        className="inline-flex min-h-11 items-center rounded-[var(--radius)] border border-[var(--rule-strong)] px-3 font-medium text-[var(--accent-soft-ink)] hover:no-underline"
      >
        {ASK_COPY.exampleBannerLink}
      </Link>
      <button
        type="button"
        aria-label={ASK_COPY.exampleBannerHide}
        className="inline-flex size-11 items-center justify-center rounded-[var(--radius)]"
        onClick={() => {
          dismissed = true;
          try {
            localStorage.setItem(KEY, 'hidden');
          } catch {
            /* Without storage the banner returns on the next visit. */
          }
          for (const listener of listeners) listener();
        }}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </aside>
  );
}
