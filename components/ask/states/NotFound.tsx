import { ASK_COPY } from '@/lib/copy';
import type { SseEvent } from '@/lib/sse/events';
import { PassageCard } from '../PassageCard';

export function NotFound({
  passages,
  onAnother,
}: {
  passages: Extract<SseEvent, { event: 'meta' }>['data']['passages'];
  onAnother: () => void;
}) {
  return (
    <div className="space-y-4">
      <h2 id="answer-heading">{ASK_COPY.notFoundHeading}</h2>
      <p>{ASK_COPY.notFoundBody}</p>
      <h3>{ASK_COPY.relatedReading}</h3>
      {passages.map((passage) => (
        <PassageCard
          key={passage.label}
          passage={passage}
          citation={undefined}
          selected={false}
          verified={false}
        />
      ))}
      <button type="button" className="min-h-6 underline underline-offset-4" onClick={onAnother}>
        {ASK_COPY.anotherQuestion}
      </button>
    </div>
  );
}
