'use client';

import { ASK_COPY } from '@/lib/copy';
import type { SuggestedId } from '@/lib/suggested';

type SuggestedQuestionsProps = {
  suggested: readonly { id: SuggestedId; question: string; topic: string }[];
  disabled: boolean;
  onSelect: (question: string, id: SuggestedId) => void;
};

export function SuggestedQuestions({ suggested, disabled, onSelect }: SuggestedQuestionsProps) {
  return (
    <section aria-labelledby="suggested-heading" className="space-y-3">
      <h2 id="suggested-heading" className="small">
        {ASK_COPY.suggestions}
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {suggested.map(({ id, question, topic }) => (
          <button
            key={id}
            aria-label={question}
            type="button"
            disabled={disabled}
            onClick={() => {
              onSelect(question, id);
            }}
            className="flex min-h-20 max-w-full flex-col items-start justify-center gap-1 rounded-xl border border-[var(--rule-strong)] bg-[var(--surface)] px-4 py-3 text-left whitespace-normal hover:bg-[var(--accent-soft)] disabled:opacity-50"
          >
            <span className="text-xs text-[var(--ink-3)]">{topic}</span>
            <span className="text-[15px] font-medium">{question}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
