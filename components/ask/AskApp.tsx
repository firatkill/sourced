'use client';

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
          <h2 id="answer-heading">Answer</h2>
          <StatusLine text={ask.status} />
        </section>
      )}
      <div role="status" aria-live="polite" className="sr-only">
        {ask.status.replace(/…$/, '')}
      </div>
    </div>
  );
}
