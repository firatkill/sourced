'use client';

import { Button } from '@/components/ui/button';
import type { SuggestedId } from '@/lib/suggested';

type SuggestedQuestionsProps = {
  suggested: readonly { id: SuggestedId; question: string }[];
  disabled: boolean;
  onSelect: (question: string, id: SuggestedId) => void;
};

export function SuggestedQuestions({ suggested, disabled, onSelect }: SuggestedQuestionsProps) {
  return (
    <section aria-labelledby="suggested-heading" className="max-w-[68ch] space-y-3">
      <h2 id="suggested-heading" className="small">
        Try one of these
      </h2>
      <div className="flex flex-wrap gap-2">
        {suggested.map(({ id, question }) => (
          <Button
            key={id}
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => {
              onSelect(question, id);
            }}
            className="mono focus-visible:outline-ring! h-auto! min-h-6 max-w-full justify-start px-3 py-2 text-left whitespace-normal! transition-none! focus-visible:ring-0! focus-visible:outline-2! focus-visible:outline-offset-2!"
          >
            {question}
          </Button>
        ))}
      </div>
    </section>
  );
}
