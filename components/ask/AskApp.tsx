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

type AskAppProps = {
  demoMode: 'on' | 'readonly' | 'off';
  limits: { ipDaily: number; globalDaily: number };
  suggested: readonly { id: SuggestedId; question: string }[];
  copy: { hero: string; lead: string };
};

export function AskApp({ demoMode, limits, suggested, copy }: AskAppProps) {
  const ask = useAsk(demoMode);
  const disabled =
    demoMode !== 'on' || ask.phase.kind === 'readonly' || ask.phase.kind === 'demoOff';
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
  const announcement =
    ask.phase.kind === 'done'
      ? `Answer ready with ${String(count)} verified ${count === 1 ? 'source' : 'sources'}.`
      : ask.status.replace(/…$/, '');

  return (
    <div className="space-y-8">
      <div>
        <h1 className="max-w-[24ch]">{copy.hero}</h1>
        <p className="text-[var(--ink-2)]">{copy.lead}</p>
      </div>
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
        disabled={ask.inFlight || demoMode === 'off' || ask.phase.kind === 'demoOff'}
        onSelect={(question, id) => {
          void ask.submit(question, id);
        }}
      />
      {showAnswer && (
        <section
          aria-labelledby="answer-heading"
          aria-busy={ask.inFlight}
          className="border-border space-y-4 border-t pt-8"
        >
          <div className="grid items-start gap-8 lg:grid-cols-[3fr_2fr]">
            <div className="min-w-0 space-y-4">
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
                <p>
                  {ask.citations.invalid.length === 1
                    ? '1 citation was removed because its quote was not found in the passage.'
                    : `${String(ask.citations.invalid.length)} citations were removed because their quotes were not found in the passages.`}
                </p>
              )}
              {ask.phase.kind === 'done' && (
                <AnswerActions
                  key={ask.phase.done.requestId}
                  citations={ask.phase.citations}
                  passages={ask.phase.meta.passages}
                  onAnother={ask.askAnother}
                />
              )}
            </div>
            {meta && (
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
