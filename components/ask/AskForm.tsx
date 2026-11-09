'use client';

import type { Ref } from 'react';
import { Square } from 'lucide-react';
import { ASK_COPY } from '@/lib/copy';
import { QUESTION } from '@/lib/config';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

type AskFormProps = {
  question: string;
  onChange: (question: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  inputRef: Ref<HTMLTextAreaElement>;
  inFlight: boolean;
  disabled: boolean;
  dailyLimit: number;
  error: string | null;
};

export function AskForm({
  question,
  onChange,
  onSubmit,
  onStop,
  inputRef,
  inFlight,
  disabled,
  dailyLimit,
  error,
}: AskFormProps) {
  return (
    <form
      className="max-w-[68ch] space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled && !inFlight) onSubmit();
      }}
    >
      <label htmlFor="question" className="block font-medium">
        Your question
      </label>
      <Textarea
        ref={inputRef}
        id="question"
        name="question"
        placeholder={
          disabled ? ASK_COPY.readonlyPlaceholder : 'e.g. When does a partial index help?'
        }
        value={question}
        maxLength={QUESTION.MAX_CHARS}
        readOnly={inFlight}
        disabled={disabled}
        aria-invalid={error !== null}
        aria-describedby={`question-counter question-helper${error === null ? '' : ' question-error'}`}
        className="bg-card focus-visible:outline-ring! min-h-32 text-[17px]! leading-7 transition-none! focus-visible:ring-0! focus-visible:outline-2! focus-visible:outline-offset-2!"
        onChange={(event) => {
          onChange(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            if (!disabled && !inFlight) onSubmit();
          }
        }}
      />
      <div className="flex items-center justify-between gap-4">
        <span
          id="question-counter"
          aria-live="off"
          className={`mono ${question.length >= QUESTION.COUNTER_WARN_AT ? 'text-destructive' : 'text-muted-foreground'}`}
        >
          {question.length} / {QUESTION.MAX_CHARS}
        </span>
        {inFlight ? (
          <Button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              onStop();
            }}
            className="focus-visible:outline-ring! transition-none! focus-visible:ring-0! focus-visible:outline-2! focus-visible:outline-offset-2!"
          >
            <Square aria-hidden="true" />
            Stop
          </Button>
        ) : (
          <Button
            type="submit"
            disabled={disabled || question.trim().length === 0}
            className="focus-visible:outline-ring! transition-none! focus-visible:ring-0! focus-visible:outline-2! focus-visible:outline-offset-2!"
          >
            Ask
          </Button>
        )}
      </div>
      {error !== null && (
        <div id="question-error" role="alert" className="small text-destructive">
          {error}
        </div>
      )}
      <p id="question-helper" className="small text-[var(--ink-2)]">
        {dailyLimit} questions per visitor per day. Questions are{' '}
        <a
          href="/how-it-works#privacy"
          className="underline underline-offset-4 focus-visible:outline-offset-2"
        >
          not stored
        </a>
        .
      </p>
    </form>
  );
}
