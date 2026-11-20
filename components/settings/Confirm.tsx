'use client';

// T-92: an inline confirm for actions that delete; the destructive button never comes first.
import { useState, type ReactNode } from 'react';

export function ConfirmButton({
  label,
  question,
  confirmLabel,
  onConfirm,
  danger = true,
}: {
  label: string;
  question: ReactNode;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
  danger?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open)
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
        className={`h-11 rounded-[var(--radius-md)] border border-[var(--rule-strong)] px-4 text-sm ${danger ? 'text-[var(--danger)]' : ''}`}
      >
        {label}
      </button>
    );
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      <span className="text-sm">{question}</span>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setError(null);
        }}
        className="h-11 rounded-[var(--radius-md)] px-3 text-sm text-[var(--ink-2)]"
      >
        Cancel
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError(null);
          onConfirm().then(
            () => {
              setBusy(false);
              setOpen(false);
            },
            (failure: unknown) => {
              setBusy(false);
              setError(
                failure instanceof Error ? failure.message : 'That did not work. Try again.',
              );
            },
          );
        }}
        className={`h-11 rounded-[var(--radius-md)] px-4 text-sm font-semibold disabled:opacity-60 ${danger ? 'bg-[var(--danger)] text-[var(--ground)]' : 'bg-[var(--accent)] text-[var(--accent-ink)]'}`}
      >
        {busy ? 'Working…' : confirmLabel}
      </button>
      {error && (
        <p role="alert" className="basis-full text-sm text-[var(--danger)]">
          {error}
        </p>
      )}
    </div>
  );
}
