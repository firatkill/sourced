import type { SseEvent } from '@/lib/sse/events';

type Passage = Extract<SseEvent, { event: 'meta' }>['data']['passages'][number];
type Citation = Extract<SseEvent, { event: 'citations' }>['data']['valid'][number];

// Clip, sort and merge overlapping verified spans without changing UTF-16 offsets.
export function quoteSegments(content: string, citations: Citation[]) {
  const spans = citations
    .map((c) => c.quoteSpan)
    .filter(
      (s) =>
        Number.isInteger(s.start) &&
        Number.isInteger(s.end) &&
        s.start >= 0 &&
        s.start < s.end &&
        s.end <= content.length,
    )
    .sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const span of spans) {
    const previous = merged.at(-1);
    if (previous && span.start <= previous.end) previous.end = Math.max(previous.end, span.end);
    else merged.push({ ...span });
  }
  const result: { text: string; marked: boolean; start: number }[] = [];
  let position = 0;
  for (const span of merged) {
    if (span.start > position)
      result.push({ text: content.slice(position, span.start), marked: false, start: position });
    result.push({ text: content.slice(span.start, span.end), marked: true, start: span.start });
    position = span.end;
  }
  if (position < content.length)
    result.push({ text: content.slice(position), marked: false, start: position });
  return result;
}
export function PassageCard({ passage, citations }: { passage: Passage; citations: Citation[] }) {
  const segments = quoteSegments(passage.content, citations);
  const paragraphs = Array.from(passage.content.matchAll(/[^\r\n]+(?:\r?\n(?!\r?\n)[^\r\n]+)*/g));
  return (
    <div className="space-y-4" data-passage={passage.label}>
      {paragraphs.map((paragraph) => (
        <p key={paragraph.index} className="overflow-x-auto whitespace-pre-wrap">
          {segments.map((segment) => {
            const start = Math.max(segment.start, paragraph.index);
            const end = Math.min(
              segment.start + segment.text.length,
              paragraph.index + paragraph[0].length,
            );
            if (start >= end) return null;
            const text = passage.content.slice(start, end);
            return segment.marked ? (
              <mark key={start} aria-description="Supporting quote">
                {text}
              </mark>
            ) : (
              <span key={start}>{text}</span>
            );
          })}
        </p>
      ))}
    </div>
  );
}
