'use client';

import { useState } from 'react';
import { Modal } from '@/components/ask/Modal';
import { setupApi } from '@/components/setup/api';
import { RESET_COPY } from '@/lib/copy';

type Scope = 'library' | 'everything';

/** D-153: Reset all data. The library reset keeps chats; "everything" removes them too. */
export function ResetDataDialog({ onClose }: { onClose: () => void }) {
  const [scope, setScope] = useState<Scope>('library');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options: { id: Scope; title: string; body: string }[] = [
    { id: 'library', title: RESET_COPY.libraryTitle, body: RESET_COPY.libraryBody },
    { id: 'everything', title: RESET_COPY.everythingTitle, body: RESET_COPY.everythingBody },
  ];
  const confirm = scope === 'library' ? RESET_COPY.libraryTitle : RESET_COPY.everythingTitle;
  return (
    <Modal
      label={RESET_COPY.title}
      onClose={() => {
        if (!working) onClose();
      }}
      className="m-auto w-[min(520px,calc(100vw-32px))] rounded-[var(--radius-lg)] border border-[var(--rule-strong)] bg-[var(--surface)] p-6 text-[var(--ink)]"
    >
      <h2 className="text-xl! font-semibold">{RESET_COPY.title}</h2>
      <p className="mt-1.5 text-sm text-[var(--ink-2)]">{RESET_COPY.body}</p>
      <fieldset className="mt-5 space-y-2.5">
        <legend className="sr-only">{RESET_COPY.legend}</legend>
        {options.map((option) => (
          <label
            key={option.id}
            className={`flex cursor-pointer gap-3 rounded-[var(--radius)] border p-4 ${scope === option.id ? 'border-[var(--danger)] bg-[var(--danger-soft)]' : 'border-[var(--rule-strong)]'}`}
          >
            <input
              type="radio"
              name="reset-scope"
              value={option.id}
              checked={scope === option.id}
              onChange={() => {
                setScope(option.id);
              }}
              className="mt-1 size-[18px] shrink-0 accent-[var(--danger)]"
            />
            <span>
              <span className="block font-semibold">{option.title}</span>
              <span className="mt-1 block text-sm text-[var(--ink-2)]">{option.body}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {error && (
        <p role="alert" className="mt-4 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <button
          type="button"
          autoFocus
          disabled={working}
          className="min-h-11 rounded-md border border-[var(--rule-strong)] px-4"
          onClick={onClose}
        >
          {RESET_COPY.cancel}
        </button>
        <button
          type="button"
          disabled={working}
          className="min-h-11 rounded-md bg-[var(--danger)] px-4 font-medium text-[var(--surface)] disabled:opacity-60"
          onClick={() => {
            setWorking(true);
            setError(null);
            setupApi
              .resetData(scope)
              .then(() => {
                // A full load, so the sidebar, the banner and the counts all start fresh.
                window.location.replace('/');
              })
              .catch((cause: unknown) => {
                setWorking(false);
                setError(
                  cause instanceof Error && cause.message ? cause.message : RESET_COPY.failed,
                );
              });
          }}
        >
          {working ? RESET_COPY.working : confirm}
        </button>
      </div>
    </Modal>
  );
}
