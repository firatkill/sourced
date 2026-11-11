'use client';

import type { Ref } from 'react';
import { ASK_COPY, formatAskCopy, type CorpusCopy } from '@/lib/copy';
import { QUESTION } from '@/lib/config';
import { ChatIcon } from './ChatIcon';
import { Textarea } from '@/components/ui/textarea';

type AskFormProps = {
  copy?: Pick<CorpusCopy, 'placeholder' | 'nextPlaceholder'>;
  question: string;
  onChange: (question: string) => void;
  onSubmit: () => void;
  inputRef: Ref<HTMLTextAreaElement>;
  inFlight: boolean;
  disabled: boolean;
  dailyLimit: number | null;
  error: string | null;
  hasTurns?: boolean;
};

export function AskForm({
  copy = ASK_COPY,
  question,
  onChange,
  onSubmit,
  inputRef,
  inFlight,
  disabled,
  dailyLimit,
  error,
  hasTurns = false,
}: AskFormProps) {
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled && !inFlight) onSubmit();
      }}
    >
      <label htmlFor="question" className={hasTurns ? 'sr-only' : 'block font-medium'}>
        Your question
      </label>
      <div className="flex items-end gap-3 rounded-2xl border border-[var(--rule-strong)] bg-[var(--surface)] p-3">
        <Textarea
          ref={inputRef}
          id="question"
          name="question"
          placeholder={
            disabled
              ? ASK_COPY.readonlyPlaceholder
              : hasTurns
                ? copy.nextPlaceholder
                : copy.placeholder
          }
          rows={2}
          value={question}
          maxLength={QUESTION.MAX_CHARS}
          readOnly={inFlight}
          disabled={disabled}
          aria-invalid={error !== null}
          aria-describedby={`question-counter${dailyLimit === null ? '' : ' question-helper'}${error === null ? '' : ' question-error'}`}
          className="focus-visible:outline-ring! min-h-20 min-w-0 flex-1 resize-none border-0! bg-transparent! text-base! leading-7 transition-none! focus-visible:ring-0! focus-visible:outline-2! focus-visible:outline-offset-2! focus-visible:outline-solid!"
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
        <button
          type="submit"
          aria-label="Ask"
          disabled={disabled || inFlight || question.trim().length === 0}
          className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] text-[var(--accent-ink)] disabled:opacity-50"
        >
          <ChatIcon name="up" size={20} />
        </button>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span
          id="question-counter"
          aria-live="off"
          className={`text-xs ${question.length >= QUESTION.COUNTER_WARN_AT ? 'text-[var(--warn)]' : 'text-[var(--ink-3)]'}`}
        >
          {question.length} / {QUESTION.MAX_CHARS}
        </span>
      </div>
      {error !== null && (
        <div id="question-error" role="alert" className="small text-destructive">
          {error}
        </div>
      )}
      {dailyLimit !== null && (
        <p id="question-helper" className="text-xs text-[var(--ink-3)]">
          <span>{formatAskCopy(ASK_COPY.limit, { limit: dailyLimit })}</span> Questions are{' '}
          <a href="/how-it-works#privacy" className="underline underline-offset-4">
            not stored
          </a>
          .
        </p>
      )}
    </form>
  );
}
