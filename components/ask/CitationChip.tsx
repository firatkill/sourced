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
    'inline-flex min-h-6 min-w-6 items-center justify-center rounded-sm border px-1 font-mono text-xs';
  if (!passage)
    return (
      <span className={`${className} border-[var(--rule-strong)] text-[var(--ink-3)]`}>
        {label}
      </span>
    );
  return (
    <button
      type="button"
      className={`${className} border-[var(--accent)] text-[var(--accent)]`}
      aria-label={`Source ${label}: ${passage.documentTitle}, ${passage.headingPath.at(-1) ?? ''}`}
      onClick={() => {
        onSelect(label);
      }}
    >
      {label}
    </button>
  );
}
