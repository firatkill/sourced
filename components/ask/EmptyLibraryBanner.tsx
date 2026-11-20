import Link from 'next/link';
import { Library } from 'lucide-react';
import { EMPTY_LIBRARY_COPY } from '@/lib/copy';

/** D-153: the library was reset; saved chats stay readable, asking waits for documents. */
export function EmptyLibraryBanner() {
  return (
    <aside
      aria-label={EMPTY_LIBRARY_COPY.label}
      className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--rule-strong)] bg-[var(--warn-soft)] p-3 pl-4 text-sm"
    >
      <Library size={20} aria-hidden="true" className="shrink-0 text-[var(--warn)]" />
      <div className="min-w-0 flex-[1_1_320px]">
        <p className="font-semibold text-[var(--ink)]">{EMPTY_LIBRARY_COPY.heading}</p>
        <p className="text-[var(--ink-2)]">{EMPTY_LIBRARY_COPY.body}</p>
      </div>
      <Link
        href="/settings/library"
        className="inline-flex min-h-11 items-center rounded-[var(--radius)] bg-[var(--accent)] px-4 font-medium text-[var(--accent-ink)] hover:no-underline"
      >
        {EMPTY_LIBRARY_COPY.link}
      </Link>
    </aside>
  );
}
