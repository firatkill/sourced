'use client';

import { useEffect, useRef, useState } from 'react';
import { AnswerView } from './AnswerView';
import { SourcesPanel } from './SourcesPanel';
import { AnswerActions } from './AnswerActions';
import { useAsk } from '@/hooks/useAsk';
import type { SuggestedId } from '@/lib/suggested';
import { AskForm } from './AskForm';
import { SuggestedQuestions } from './SuggestedQuestions';
import { StatusLine } from './StatusLine';
import { ASK_COPY, formatAskCopy, removedCitationsCopy } from '@/lib/copy';
import { HowAnswered } from './HowAnswered';
import { NotFound } from './states/NotFound';
import { DemoOff, ReadonlyBanner } from './states/DemoState';
import { RateLimited, rateLimitCopy } from './states/RateLimited';
import { RequestError } from './states/RequestError';
import { Stopped } from './states/Stopped';

type AskAppProps = {
  demoMode: 'on' | 'readonly' | 'off';
  limits: { ipDaily: number; globalDaily: number };
  suggested: readonly { id: SuggestedId; question: string }[];
  copy: { hero: string; lead: string };
};

export function AskApp({ demoMode, limits, suggested, copy }: AskAppProps) {
  const ask = useAsk(demoMode);
  // HTTP demo-mode responses also apply to subsequent cached questions.
  const [effectiveMode, setEffectiveMode] = useState(demoMode);
  const responseMode =
    ask.phase.kind === 'readonly' ? 'readonly' : ask.phase.kind === 'demoOff' ? 'off' : null;
  if (responseMode !== null && effectiveMode !== responseMode) setEffectiveMode(responseMode);
  const disabled = effectiveMode !== 'on';
  const showAnswer =
    ask.phase.kind !== 'idle' &&
    ask.phase.kind !== 'validationError' &&
    ask.phase.kind !== 'readonly' &&
    ask.phase.kind !== 'demoOff';

  const [selected, setSelected] = useState<string | null>(null);
  const selectionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => () => {
      clearTimeout(selectionTimer.current);
    },
    [],
  );
  const meta = 'meta' in ask.phase ? ask.phase.meta : null;
  const text =
    'text' in ask.phase ? ask.phase.text : 'partialText' in ask.phase ? ask.phase.partialText : '';
  const selectSource = (label: string) => {
    const card = document.getElementById(`source-${label}`);
    card?.focus({ preventScroll: true });
    card?.scrollIntoView({
      block: 'nearest',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
    setSelected(label);
    clearTimeout(selectionTimer.current);
    selectionTimer.current = setTimeout(() => {
      setSelected(null);
    }, 2000);
  };
  const count = ask.citations?.valid.length ?? 0;
  const rateCopy =
    ask.phase.kind === 'rateLimited'
      ? rateLimitCopy(ask.phase.scope, ask.phase.resetAt, limits)
      : null;
  const announcement =
    ask.phase.kind === 'done'
      ? `Answer ready with ${String(count)} verified ${count === 1 ? 'source' : 'sources'}.`
      : ask.phase.kind === 'notFound'
        ? ASK_COPY.notFoundAnnouncement
        : ask.phase.kind === 'stopped'
          ? ASK_COPY.stoppedAnnouncement
          : ask.phase.kind === 'providerError'
            ? ASK_COPY.providerHeading
            : rateCopy
              ? `${rateCopy.heading}. ${rateCopy.body}`
              : ask.status.replace(/…$/, '');
  useEffect(() => {
    if (ask.phase.kind === 'rateLimited') ask.inputRef.current?.focus();
  }, [ask.phase.kind, ask.inputRef]);

  const partialAnswer = (
    <AnswerView
      text={text}
      passages={meta?.passages ?? []}
      citations={null}
      onSelect={selectSource}
    />
  );
  const renderAnswer = () => {
    switch (ask.phase.kind) {
      case 'notFound':
        return <NotFound passages={meta?.passages ?? []} onAnother={ask.askAnother} />;
      case 'rateLimited':
        return rateCopy && <RateLimited {...rateCopy} scope={ask.phase.scope} />;
      case 'providerError':
      case 'serverError':
      case 'networkError': {
        const phase = ask.phase;
        const heading =
          phase.kind === 'providerError'
            ? ASK_COPY.providerHeading
            : phase.kind === 'serverError'
              ? ASK_COPY.serverHeading
              : ASK_COPY.networkHeading;
        const body =
          phase.kind === 'providerError'
            ? phase.refunded
              ? ASK_COPY.providerRefundedBody
              : ASK_COPY.providerBody
            : phase.kind === 'serverError'
              ? formatAskCopy(ASK_COPY.serverBody, { requestId: phase.requestId.slice(0, 8) })
              : ASK_COPY.networkBody;
        return (
          <RequestError
            heading={heading}
            body={body}
            onRetry={() => {
              void ask.submit(phase.question);
            }}
          >
            {phase.kind === 'networkError' && (
              <>
                <p>{ASK_COPY.partialLabel}</p>
                {partialAnswer}
              </>
            )}
          </RequestError>
        );
      }
      case 'stopped':
        return <Stopped onAnother={ask.askAnother}>{partialAnswer}</Stopped>;
      default:
        return (
          <>
            <h2 id="answer-heading">Answer</h2>
            {meta?.cached && <p>Answered in advance</p>}
            <StatusLine text={ask.status} />
            <AnswerView
              text={text}
              passages={meta?.passages ?? []}
              citations={ask.citations}
              onSelect={selectSource}
            />
            {ask.citations && ask.citations.invalid.length > 0 && (
              <p>{removedCitationsCopy(ask.citations.invalid.length)}</p>
            )}
            {ask.phase.kind === 'done' && (
              <AnswerActions
                key={ask.phase.done.requestId}
                citations={ask.phase.citations}
                passages={ask.phase.meta.passages}
                onAnother={ask.askAnother}
              />
            )}
          </>
        );
    }
  };
  const showSources = meta !== null && ask.phase.kind !== 'notFound';

  return (
    <div className="space-y-8">
      <div>
        <h1 className="max-w-[24ch]">{copy.hero}</h1>
        <p className="text-[var(--ink-2)]">{copy.lead}</p>
      </div>
      {effectiveMode === 'off' ? (
        <DemoOff />
      ) : (
        <>
          {effectiveMode === 'readonly' && <ReadonlyBanner />}
          <AskForm
            question={ask.question}
            onChange={ask.setQuestion}
            onSubmit={() => {
              void ask.submit(ask.question);
            }}
            onStop={ask.stop}
            inputRef={ask.inputRef}
            inFlight={ask.inFlight}
            disabled={disabled}
            dailyLimit={limits.ipDaily}
            error={ask.phase.kind === 'validationError' ? ask.phase.message : null}
          />
          <SuggestedQuestions
            suggested={suggested}
            disabled={ask.inFlight}
            onSelect={(question, id) => {
              void ask.submit(question, id);
            }}
          />
        </>
      )}
      {showAnswer && effectiveMode !== 'off' && (
        <section
          aria-labelledby="answer-heading"
          aria-busy={ask.inFlight}
          className="border-border space-y-4 border-t pt-8"
        >
          <div className={showSources ? 'grid items-start gap-8 lg:grid-cols-[3fr_2fr]' : ''}>
            <div className="min-w-0 space-y-4">
              {renderAnswer()}
              {(ask.phase.kind === 'done' || ask.phase.kind === 'notFound') &&
                meta &&
                ask.phase.done && (
                  <HowAnswered
                    key={ask.phase.done.requestId}
                    meta={meta}
                    done={ask.phase.done}
                    citations={ask.citations}
                  />
                )}
            </div>
            {showSources && (
              <SourcesPanel
                passages={meta.passages}
                citations={ask.citations}
                selected={selected}
              />
            )}
          </div>
        </section>
      )}
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}
