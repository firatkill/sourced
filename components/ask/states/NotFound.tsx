import { ASK_COPY } from '@/lib/copy';
import type { SseEvent } from '@/lib/sse/events';
import { ExternalLink } from 'lucide-react';

export function NotFound({
  body = ASK_COPY.notFoundBody,
  passages,
  onAnother,
}: {
  body?: string;
  passages: Extract<SseEvent, { event: 'meta' }>['data']['passages'];
  onAnother: () => void;
}) {
  return (
    <div className="space-y-4">
      <h2>{ASK_COPY.notFoundHeading}</h2>
      <p>{body}</p>
      <h3>{ASK_COPY.relatedReading}</h3>
      {passages.map((passage) =>
        passage.officialUrl === null ? (
          <p key={passage.label} className="rounded-md border border-[var(--rule)] p-4">
            {passage.filePath}
            {passage.pageFrom !== undefined
              ? `, page ${String(passage.pageFrom)}`
              : ` › ${passage.headingPath.join(' › ')}`}
          </p>
        ) : (
          <a
            key={passage.label}
            href={passage.officialUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-20 items-center justify-between gap-3 rounded-md border border-[var(--rule)] p-4"
            aria-label={`${passage.headingPath.at(-1) ?? passage.documentTitle} (opens in a new tab)`}
          >
            <span>
              {passage.headingPath.at(-1) ?? passage.documentTitle}
              {ASK_COPY.docsDomain && (
                <span className="block text-xs text-[var(--ink-3)]">{ASK_COPY.docsDomain}</span>
              )}
            </span>
            <ExternalLink size={16} aria-hidden="true" />
          </a>
        ),
      )}
      <button type="button" className="min-h-6 underline underline-offset-4" onClick={onAnother}>
        {ASK_COPY.anotherQuestion}
      </button>
    </div>
  );
}
