import type { SseEvent } from '@/lib/sse/events';
import { PassageCard } from './PassageCard';

type Meta = Extract<SseEvent, { event: 'meta' }>['data'];
type Citations = Extract<SseEvent, { event: 'citations' }>['data'];

export function SourcesPanel({
  passages,
  citations,
  selected,
}: {
  passages: Meta['passages'];
  citations: Citations | null;
  selected: string | null;
}) {
  const cited = new Set(citations?.valid.map((citation) => citation.label));
  const ordered = [...passages].sort(
    (a, b) =>
      Number(cited.has(b.label)) - Number(cited.has(a.label)) || a.label.localeCompare(b.label),
  );
  return (
    <section
      aria-labelledby="sources-heading"
      className="min-w-0 space-y-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:p-1"
    >
      <h2 id="sources-heading">Sources</h2>
      {ordered.map((passage) => (
        <PassageCard
          key={passage.label}
          passage={passage}
          citation={citations?.valid.find((citation) => citation.label === passage.label)}
          selected={selected === passage.label}
          verified={citations !== null}
        />
      ))}
    </section>
  );
}
