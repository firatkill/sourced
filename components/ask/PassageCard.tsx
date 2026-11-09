import { ASK_COPY } from '@/lib/copy';
import type { SseEvent } from '@/lib/sse/events';

type Passage = Extract<SseEvent, { event: 'meta' }>['data']['passages'][number];
type Citation = Extract<SseEvent, { event: 'citations' }>['data']['valid'][number];

export function PassageCard({
  passage,
  citation,
  selected,
  verified,
}: {
  passage: Passage;
  citation: Citation | undefined;
  selected: boolean;
  verified: boolean;
}) {
  const span = citation?.quoteSpan;
  const validSpan =
    span &&
    Number.isInteger(span.start) &&
    Number.isInteger(span.end) &&
    span.start >= 0 &&
    span.start < span.end &&
    span.end <= passage.content.length
      ? span
      : null;
  // Keep offsets in the original UTF-16 string, including paragraph separators.
  const paragraphs = Array.from(passage.content.matchAll(/[^\r\n]+(?:\r?\n(?!\r?\n)[^\r\n]+)*/g));
  return (
    <article
      id={`source-${passage.label}`}
      tabIndex={-1}
      aria-labelledby={`source-${passage.label}-heading`}
      className={`border-border space-y-3 rounded border p-4 ${selected ? 'outline-2 outline-offset-2 outline-[var(--accent)]' : ''}`}
    >
      <h3 id={`source-${passage.label}-heading`}>
        {passage.label} · {passage.documentTitle} › {passage.headingPath.join(' › ')}
      </h3>
      {verified && !citation && <p className="text-sm text-[var(--ink-2)]">Retrieved, not cited</p>}
      {paragraphs.map((match) => {
        const text = match[0];
        const start = match.index;
        const from = validSpan ? Math.max(0, validSpan.start - start) : 0;
        const to = validSpan ? Math.min(text.length, validSpan.end - start) : 0;
        return (
          <p key={start} className="overflow-x-auto whitespace-pre-wrap">
            {from < to ? (
              <>
                {text.slice(0, from)}
                <mark aria-description="Supporting quote" className="text-inherit">
                  {text.slice(from, to)}
                </mark>
                {text.slice(to)}
              </>
            ) : (
              text
            )}
          </p>
        );
      })}
      <a
        href={passage.officialUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${ASK_COPY.docsLink}: ${passage.documentTitle}`}
      >
        {ASK_COPY.docsLink}
      </a>
    </article>
  );
}
