'use client';

import { useState, useSyncExternalStore } from 'react';
import { Copy, SquareTerminal, X } from 'lucide-react';
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

/** REDESIGN-v2 §3.2: in the local profile, the bundled example explains how to switch. */
export function ExampleBanner({ notice, commands }: { notice: string; commands: string[] }) {
  const isHidden = useSyncExternalStore(subscribe, hidden, () => false);
  const [copied, setCopied] = useState(false);
  if (isHidden) return null;
  return (
    <aside
      aria-label={ASK_COPY.exampleBannerLabel}
      className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--rule-strong)] bg-[var(--accent-soft)] p-3 pl-4 text-sm text-[var(--accent-soft-ink)]"
    >
      <SquareTerminal size={20} aria-hidden="true" className="shrink-0" />
      <p className="min-w-0 flex-[1_1_320px]">
        <strong className="font-semibold">{notice}</strong> {ASK_COPY.exampleBannerBefore}{' '}
        {commands.map((command, index) => (
          <span key={command}>
            {index > 0 && ` ${ASK_COPY.exampleBannerThen} `}
            <code className="rounded-[var(--radius-sm)] bg-[var(--surface)] px-1.5 py-0.5 font-mono text-xs text-[var(--ink)]">
              {command}
            </code>
          </span>
        ))}
      </p>
      <button
        type="button"
        className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius)] border border-[var(--rule-strong)] px-3 font-medium"
        onClick={() => {
          void navigator.clipboard.writeText(commands.join('\n')).then(() => {
            setCopied(true);
            setTimeout(() => {
              setCopied(false);
            }, 2000);
          });
        }}
      >
        <Copy size={15} aria-hidden="true" />
        {copied ? ASK_COPY.exampleBannerCopied : ASK_COPY.exampleBannerCopy}
      </button>
      <span className="sr-only" aria-live="polite">
        {copied ? ASK_COPY.exampleBannerCopied : ''}
      </span>
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
