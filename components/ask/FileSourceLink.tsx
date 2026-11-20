'use client';

import { useEffect, useState } from 'react';
import { ASK_COPY } from '@/lib/copy';
import { ChatIcon } from './ChatIcon';

/**
 * T-84 / REDESIGN-v2 §7: in saved-chat mode a file citation opens the original file (PDFs at
 * the cited page). A file that left the library shows a note instead of a dead link.
 */
export function FileSourceLink({
  chunkId,
  pageFrom,
}: {
  chunkId: string;
  pageFrom?: number | undefined;
}) {
  const href = `/api/files/chunk/${encodeURIComponent(chunkId)}${pageFrom === undefined ? '' : `#page=${String(pageFrom)}`}`;
  const [state, setState] = useState<'checking' | 'available' | 'missing'>('checking');
  useEffect(() => {
    let live = true;
    void fetch(href.split('#')[0] ?? href, { method: 'HEAD' }).then(
      (response) => {
        if (live) setState(response.ok ? 'available' : 'missing');
      },
      () => {
        if (live) setState('missing');
      },
    );
    return () => {
      live = false;
    };
  }, [href]);
  if (state === 'missing')
    return (
      <p
        role="note"
        className="rounded-[var(--radius)] bg-[var(--warn-soft)] p-3 text-sm text-[var(--warn)]"
      >
        {ASK_COPY.fileMissing}
      </p>
    );
  const label =
    pageFrom === undefined ? ASK_COPY.openFile : `${ASK_COPY.openAtPage} ${String(pageFrom)}`;
  return (
    <a
      className="source-primary flex h-11 w-full items-center justify-center gap-2 rounded-[var(--radius)] text-sm font-semibold hover:no-underline aria-disabled:opacity-60"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-disabled={state === 'checking' || undefined}
      aria-label={`${label} (opens in a new tab)`}
    >
      {label}
      <ChatIcon name="external" />
    </a>
  );
}
