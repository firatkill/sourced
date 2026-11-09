import { ChatIcon } from './ChatIcon';
import { ASK_COPY, formatAskCopy, removedCitationsCopy } from '@/lib/copy';
import type { SseEvent } from '@/lib/sse/events';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

type Meta = Extract<SseEvent, { event: 'meta' }>['data'];
type Done = Extract<SseEvent, { event: 'done' }>['data'];
type Citations = Extract<SseEvent, { event: 'citations' }>['data'];

export function HowAnswered({
  meta,
  done,
  citations,
}: {
  meta: Meta;
  done: Done;
  citations: Citations | null;
}) {
  return (
    <Collapsible className="contents">
      <CollapsibleTrigger className="answer-action group">
        <ChatIcon name="right" size={15} className="group-data-[state=open]:rotate-90" />
        {ASK_COPY.disclosure}
      </CollapsibleTrigger>
      <CollapsibleContent className="order-last w-full min-w-0 basis-full space-y-4 pt-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="mb-2 text-left">{ASK_COPY.rankedCaption}</caption>
            <thead>
              <tr>
                {ASK_COPY.rankColumns.map((column) => (
                  <th key={column} scope="col" className="p-2">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {meta.passages.map((passage) => (
                <tr key={passage.label}>
                  <th scope="row" className="p-2">
                    {passage.label}
                  </th>
                  <td className="p-2">{passage.scores.vectorRank ?? ASK_COPY.emptyRank}</td>
                  <td className="p-2">{passage.scores.ftsRank ?? ASK_COPY.emptyRank}</td>
                  <td className="p-2">{passage.scores.rrf}</td>
                  <td className="p-2">{passage.scores.rerankPosition}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>{meta.retrieval.rerankFallback ? ASK_COPY.rerankFallback : ASK_COPY.reranked}</p>
        {meta.cached ? (
          meta.cachedAt !== null && (
            <p>
              {formatAskCopy(ASK_COPY.cached, {
                date: new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(
                  new Date(meta.cachedAt),
                ),
              })}
            </p>
          )
        ) : (
          <>
            <p>
              {formatAskCopy(ASK_COPY.timings, {
                retrieval: Math.round(
                  meta.retrieval.timingsMs.embed + meta.retrieval.timingsMs.search,
                ),
                rerank: Math.round(meta.retrieval.timingsMs.rerank),
                generation: (done.latencyMs.generation / 1000).toFixed(1),
                total: (done.latencyMs.total / 1000).toFixed(1),
              })}
            </p>
            <p>
              {formatAskCopy(ASK_COPY.tokens, {
                in: done.usage.inputTokens,
                out: done.usage.outputTokens,
                cost: done.costUsdEstimate.toFixed(4),
              })}
            </p>
          </>
        )}
        {citations?.quoteFallbackUsed && <p>{ASK_COPY.quoteFallback}</p>}
        {citations && citations.invalid.length > 0 && (
          <>
            <p>{removedCitationsCopy(citations.invalid.length)}</p>
            <ul className="list-disc space-y-1 pl-5">
              {citations.invalid.map((citation, index) => (
                <li key={`${citation.label}-${String(index)}`}>
                  {formatAskCopy(ASK_COPY.removedCitation, {
                    label: citation.label,
                    reason: ASK_COPY.removalReasons[citation.reason],
                  })}
                </li>
              ))}
            </ul>
          </>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
