import type { SseEvent } from '@/lib/sse/events';

type Passage = Extract<SseEvent, { event: 'meta' }>['data']['passages'][number];

export function CitationChip({
  label,
  passage,
  onSelect,
}: {
  label: string;
  passage: Passage | undefined;
  onSelect: (label: string) => void;
}) {
  const className =
    'inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-[6px] border px-1 font-mono text-xs';
  if (!passage)
    return (
      <span className={`${className} border-[var(--rule-strong)] text-[var(--ink-3)]`}>
        {label.slice(1)}
      </span>
    );
  return (
    <button
      type="button"
      className="inline-flex min-h-6 min-w-6 items-center justify-center"
      aria-label={`Source ${label}: ${passage.documentTitle}, ${passage.headingPath.at(-1) ?? ''}`}
      onClick={() => {
        onSelect(label);
      }}
    >
      <span
        className={`${className} border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-soft-ink)]`}
      >
        {label.slice(1)}
      </span>
    </button>
  );
}
