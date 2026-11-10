'use client';

import { lazy, Suspense } from 'react';
import { Square } from 'lucide-react';
import { askStatus, isInFlight, type AskState } from '@/hooks/useAsk';
import { ASK_COPY, formatAskCopy } from '@/lib/copy';
import { SourcesPanel } from './SourcesPanel';
import { HowAnswered } from './HowAnswered';
import { NotFound } from './states/NotFound';
import { DemoOff, ReadonlyBanner } from './states/DemoState';
import { RateLimited, rateLimitCopy } from './states/RateLimited';
import { RequestError } from './states/RequestError';
import { Stopped } from './states/Stopped';

const AnswerView = lazy(async () => ({ default: (await import('./AnswerView')).AnswerView }));
const AnswerActions = lazy(async () => ({
  default: (await import('./AnswerActions')).AnswerActions,
}));
export type ChatTurn = AskState & { id: number };
export function Turn({
  turn,
  copy = ASK_COPY,
  limits,
  selected,
  onSelect,
  onRetry,
  onAnother,
  onStop,
}: {
  turn: ChatTurn;
  copy?: Pick<typeof ASK_COPY, 'notFoundBody' | 'searched'>;
  limits: { ipDaily: number; globalDaily: number };
  selected: string | null;
  onSelect: (label: string) => void;
  onRetry: () => void;
  onAnother: () => void;
  onStop: () => void;
}) {
  const { phase, citations } = turn;
  const meta = 'meta' in phase ? phase.meta : null;
  const text = 'text' in phase ? phase.text : 'partialText' in phase ? phase.partialText : '';
  const busy = isInFlight(phase);
  const status = askStatus(phase);
  const partial = (
    <Suspense fallback={<div aria-hidden="true" className="min-h-7" />}>
      <AnswerView
        text={text}
        passages={meta?.passages ?? []}
        citations={null}
        onSelect={onSelect}
      />
    </Suspense>
  );
  function body() {
    switch (phase.kind) {
      case 'notFound':
        return (
          <NotFound
            body={copy.notFoundBody}
            passages={meta?.passages ?? []}
            onAnother={onAnother}
          />
        );
      case 'rateLimited':
        return (
          <RateLimited {...rateLimitCopy(phase.scope, phase.resetAt, limits)} scope={phase.scope} />
        );
      case 'readonly':
        return <ReadonlyBanner />;
      case 'demoOff':
        return <DemoOff />;
      case 'providerError':
      case 'serverError':
      case 'networkError':
        return (
          <RequestError
            heading={
              phase.kind === 'providerError'
                ? ASK_COPY.providerHeading
                : phase.kind === 'serverError'
                  ? ASK_COPY.serverHeading
                  : ASK_COPY.networkHeading
            }
            body={
              phase.kind === 'providerError'
                ? phase.refunded
                  ? ASK_COPY.providerRefundedBody
                  : ASK_COPY.providerBody
                : phase.kind === 'serverError'
                  ? formatAskCopy(ASK_COPY.serverBody, { requestId: phase.requestId.slice(0, 8) })
                  : ASK_COPY.networkBody
            }
            onRetry={onRetry}
          >
            {phase.kind === 'networkError' && (
              <>
                <p>{ASK_COPY.partialLabel}</p>
                {partial}
              </>
            )}
          </RequestError>
        );
      case 'stopped':
        return <Stopped onAnother={onAnother}>{partial}</Stopped>;
      case 'validationError':
        return <p role="alert">{phase.message}</p>;
      default:
        return (
          <Suspense fallback={<div aria-hidden="true" className="min-h-7" />}>
            <AnswerView
              text={text}
              passages={meta?.passages ?? []}
              citations={citations}
              onSelect={onSelect}
            />
          </Suspense>
        );
    }
  }
  const valid = citations?.valid.length ?? 0;
  const removed = citations?.invalid.length ?? 0;
  const total = valid + removed;
  const done = 'done' in phase ? phase.done : null;
  return (
    <section
      id={`turn-${String(turn.id)}`}
      tabIndex={-1}
      aria-label={turn.question}
      className="scroll-mt-6 space-y-6 outline-offset-4"
    >
      <div className="ml-auto w-fit max-w-[90%] rounded-[var(--radius-lg)] bg-[var(--user-bubble)] px-5 py-3 text-[var(--user-bubble-ink)]">
        <p className="break-words">{turn.question}</p>
      </div>
      <article aria-label="Answer" aria-busy={busy} className="min-w-0 space-y-5">
        <header className="flex flex-wrap items-center gap-3">
          <h2 className="text-base font-bold">Sourced</h2>
          {citations && (
            <span
              className={`inline-flex min-h-[26px] items-center rounded-full px-2.5 py-1 text-xs leading-4 ${removed > 0 ? 'bg-[var(--warn-soft)] text-[var(--warn)]' : 'bg-[var(--ok-soft)] text-[var(--ok)]'}`}
            >
              {removed > 0
                ? `${String(valid)} of ${String(total)} citations checked · ${String(removed)} removed`
                : `${String(valid)} of ${String(total)} ${total === 1 ? 'citation' : 'citations'} checked against the docs`}
            </span>
          )}
          {meta?.cached && <span className="text-xs text-[var(--ink-3)]">Answered in advance</span>}
        </header>
        {busy && (
          <div className="flex flex-wrap gap-2 text-xs text-[var(--ink-2)]">
            {meta && (
              <>
                <span className="rounded-full border border-[var(--rule)] px-3 py-1">
                  {copy.searched}
                </span>
                {text !== '' && (
                  <span className="rounded-full border border-[var(--rule)] px-3 py-1">
                    Read {meta.passages.length} passages
                  </span>
                )}
              </>
            )}
            <span className="rounded-full border border-[var(--rule)] px-3 py-1">{status}</span>
          </div>
        )}
        {body()}
        {busy && text !== '' && (
          <span
            aria-hidden="true"
            className="answer-caret inline-block h-5 w-1 bg-[var(--accent)]"
          />
        )}
        {busy && (
          <button
            type="button"
            onClick={onStop}
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--rule-strong)] px-3"
          >
            <Square size={14} aria-hidden="true" />
            Stop
          </button>
        )}
        {citations && removed > 0 && (
          <details className="rounded-md bg-[var(--warn-soft)] p-3 text-sm text-[var(--warn)]">
            <summary className="min-h-6 cursor-pointer">
              Why {removed} {removed === 1 ? 'citation was' : 'citations were'} removed
            </summary>
            <ul>
              {citations.invalid.map((c, index) => (
                <li key={index}>
                  {formatAskCopy(ASK_COPY.removedCitation, {
                    label: c.label,
                    reason: ASK_COPY.removalReasons[c.reason],
                  })}
                </li>
              ))}
            </ul>
          </details>
        )}
        {meta && citations && valid > 0 && (
          <SourcesPanel
            passages={meta.passages}
            citations={citations}
            selected={selected}
            onSelect={onSelect}
          />
        )}
        {meta && done && (
          <div className="flex flex-wrap items-center gap-1 border-t border-[var(--rule)] pt-3">
            {phase.kind === 'done' && (
              <Suspense fallback={null}>
                <AnswerActions citations={phase.citations} passages={meta.passages} />
              </Suspense>
            )}
            <HowAnswered meta={meta} done={done} citations={citations} />
            <p className="ml-auto font-mono text-xs text-[var(--ink-3)]">
              {meta.cached
                ? 'Answered in advance · served from the cache'
                : `${String(meta.retrieval.vectorCandidates)} + ${String(meta.retrieval.ftsCandidates)} candidates · ${String(meta.passages.length)} passages read · ${(done.latencyMs.total / 1000).toFixed(1)} s${meta.retrieval.rerankFallback ? ' · search order' : ''}`}
            </p>
          </div>
        )}
      </article>
    </section>
  );
}
