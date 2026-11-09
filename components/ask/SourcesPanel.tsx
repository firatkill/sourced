import type { SseEvent } from '@/lib/sse/events';
type Meta = Extract<SseEvent, { event: 'meta' }>['data'];
type Citations = Extract<SseEvent, { event: 'citations' }>['data'];
export function SourcesPanel({
  passages,
  citations,
  selected,
  onSelect,
}: {
  passages: Meta['passages'];
  citations: Citations;
  selected: string | null;
  onSelect: (label: string) => void;
}) {
  return (
    <section aria-label="Sources" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {passages
        .filter((p) => citations.valid.some((c) => c.label === p.label))
        .sort((a, b) => a.label.localeCompare(b.label))
        .map((p) => (
          <button
            key={p.label}
            type="button"
            aria-current={selected === p.label ? 'true' : undefined}
            className="flex min-h-16 min-w-0 items-start gap-3 rounded-xl border border-[var(--rule)] bg-[var(--surface)] px-3.5 py-3 text-left aria-current:border-[1.5px] aria-current:border-[var(--accent)] aria-current:bg-[var(--accent-soft)]"
            onClick={() => {
              onSelect(p.label);
            }}
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-[6px] bg-[var(--accent-soft)] font-mono text-xs text-[var(--accent-soft-ink)]">
              {p.label.slice(1)}
            </span>
            <span className="min-w-0 leading-[1.35] break-words">
              <span className="block text-sm font-semibold">
                {p.headingPath.at(-1) ?? p.documentTitle}
              </span>
              <span className="block text-xs text-[var(--ink-3)]">
                {p.headingPath.slice(0, -1).join(' › ') || p.documentTitle}
              </span>
            </span>
          </button>
        ))}
    </section>
  );
}
