'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { SseEvent } from '@/lib/sse/events';
import { ASK_COPY } from '@/lib/copy';
import { ChatIcon } from './ChatIcon';
import { Modal } from './Modal';
import { PassageCard } from './PassageCard';

type Meta = Extract<SseEvent, { event: 'meta' }>['data'];
type Citations = Extract<SseEvent, { event: 'citations' }>['data'];
function subscribe(callback: () => void) {
  const media = matchMedia('(min-width: 1024px)');
  media.addEventListener('change', callback);
  return () => {
    media.removeEventListener('change', callback);
  };
}
export function SourceViewer({
  passages,
  citations,
  label,
  onSelect,
  onClose,
}: {
  passages: Meta['passages'];
  citations: Citations;
  label: string;
  onSelect: (label: string) => void;
  onClose: () => void;
}) {
  const wide = useSyncExternalStore(
    subscribe,
    () => matchMedia('(min-width: 1024px)').matches,
    () => false,
  );
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (wide) ref.current?.focus();
  }, [wide]);
  const cited = passages
    .filter((p) => citations.valid.some((c) => c.label === p.label))
    .sort((a, b) => a.label.localeCompare(b.label));
  const index = cited.findIndex((p) => p.label === label);
  const passage = cited[index];
  if (!passage) return null;
  const content = (
    <>
      <div className="flex h-[60px] items-center gap-1 border-b border-[var(--rule)] px-4">
        <span className="mr-auto text-[13px] font-semibold text-[var(--ink-2)]">
          Source {index + 1} of {cited.length}
        </span>
        <button
          aria-label="Previous source"
          className="viewer-icon"
          disabled={index <= 0}
          onClick={() => {
            const previous = cited[index - 1];
            if (previous) onSelect(previous.label);
          }}
        >
          <ChatIcon name="left" size={18} />
        </button>
        <button
          aria-label="Next source"
          className="viewer-icon"
          disabled={index >= cited.length - 1}
          onClick={() => {
            const next = cited[index + 1];
            if (next) onSelect(next.label);
          }}
        >
          <ChatIcon name="right" size={18} />
        </button>
        <button aria-label="Close source viewer" className="viewer-icon" onClick={onClose}>
          <ChatIcon name="close" size={18} />
        </button>
      </div>
      <div className="source-body space-y-5 p-6">
        <p className="text-xs text-[var(--ink-3)]">
          {passage.headingPath.slice(0, -1).join(' › ') || passage.documentTitle}
        </p>
        <h2 className="text-xl! font-semibold">
          {passage.headingPath.at(-1) ?? passage.documentTitle}
        </h2>
        {passage.officialUrl === null ? (
          <p className="text-sm text-[var(--ink-3)]">
            {passage.filePath}
            {passage.pageFrom !== undefined
              ? `, page ${String(passage.pageFrom)}`
              : ` › ${passage.headingPath.join(' › ')}`}
          </p>
        ) : (
          <a
            className="source-primary flex h-11 w-full items-center justify-center gap-2 rounded-[var(--radius)] text-sm font-semibold hover:no-underline"
            href={passage.officialUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${ASK_COPY.viewerLink} (opens in a new tab)`}
          >
            {ASK_COPY.viewerLink}
            <ChatIcon name="external" />
          </a>
        )}
        <PassageCard
          passage={passage}
          citations={citations.valid.filter((c) => c.label === passage.label)}
        />
        <p className="text-[13px] text-[var(--ink-3)]">{ASK_COPY.viewerNote}</p>
      </div>
    </>
  );
  return wide ? (
    <aside
      ref={ref}
      tabIndex={-1}
      aria-label="Source viewer"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
      className="h-dvh w-[380px] shrink-0 overflow-y-auto border-l border-[var(--rule)] bg-[var(--surface)] xl:w-[400px]"
    >
      {content}
    </aside>
  ) : (
    <Modal
      label="Source viewer"
      onClose={onClose}
      className="fixed inset-x-0 top-auto bottom-0 m-0 max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-t-[var(--radius-lg)] border border-[var(--rule)] bg-[var(--surface)] text-[var(--ink)]"
    >
      {content}
    </Modal>
  );
}
