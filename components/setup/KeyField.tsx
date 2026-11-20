'use client';

// T-90/T-91: one provider key, checked with the provider's free call and saved on this
// computer. The browser only ever gets the masked key back.
import { useState } from 'react';
import { setupApi, type SetupStatus } from './api';

export function KeyField({
  provider,
  onSaved,
  help,
  startOpen = false,
  onCancel,
}: {
  provider: SetupStatus['providers'][number];
  onSaved: (masked: string) => void;
  help: string;
  /** Settings opens the form directly from its own "Replace key" button. */
  startOpen?: boolean;
  onCancel?: (() => void) | undefined;
}) {
  const [value, setValue] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [replacing, setReplacing] = useState(startOpen || !provider.saved);
  const id = `key-${provider.id}`;
  if (!replacing && provider.masked)
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--rule)] bg-[var(--surface)] p-4">
        <p>
          <span className="font-semibold">{provider.label} key</span>{' '}
          <span className="font-mono text-sm text-[var(--ink-2)]">{provider.masked}</span>
        </p>
        <button
          type="button"
          onClick={() => {
            setReplacing(true);
          }}
          className="h-11 rounded-[var(--radius-md)] border border-[var(--rule-strong)] px-4 text-sm"
        >
          Replace key
        </button>
      </div>
    );
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        setMessage(null);
        setupApi.saveKey(provider.id, value.trim()).then(
          ({ masked }) => {
            setValue('');
            setMessage({
              ok: true,
              text: `The key works. It is saved in .env.local on this computer as ${masked}.`,
            });
            setBusy(false);
            onSaved(masked);
          },
          (failure: unknown) => {
            setMessage({
              ok: false,
              text: failure instanceof Error ? failure.message : 'The key was not saved.',
            });
            setBusy(false);
          },
        );
      }}
    >
      <label htmlFor={id} className="block font-semibold">
        {provider.label} API key
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        <div className="relative min-w-0 flex-[1_1_320px]">
          <input
            id={id}
            type={show ? 'text' : 'password'}
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
            }}
            autoComplete="off"
            spellCheck={false}
            aria-describedby={`${id}-help ${id}-status`}
            className="h-12 w-full rounded-[var(--radius-md)] border border-[var(--rule-strong)] bg-[var(--surface)] pr-12 pl-3 font-mono"
          />
          <button
            type="button"
            onClick={() => {
              setShow(!show);
            }}
            aria-label={show ? 'Hide key' : 'Show key'}
            aria-pressed={show}
            className="absolute top-0.5 right-0.5 size-11 rounded-[var(--radius-sm)] text-[var(--ink-3)] hover:text-[var(--ink)]"
          >
            {show ? 'Hide' : 'Show'}
          </button>
        </div>
        <button
          type="submit"
          disabled={busy || value.trim().length < 8}
          className="h-12 rounded-[var(--radius-md)] border border-[var(--rule-strong)] px-4 disabled:opacity-60"
        >
          {busy ? 'Checking…' : 'Check and save'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="h-12 rounded-[var(--radius-md)] px-3 text-[var(--ink-2)]"
          >
            Cancel
          </button>
        )}
      </div>
      <p
        id={`${id}-status`}
        role="status"
        className={`mt-2 text-sm ${message?.ok === false ? 'text-[var(--danger)]' : 'text-[var(--ok)]'}`}
      >
        {message?.text}
      </p>
      <p id={`${id}-help`} className="mt-1 text-sm text-[var(--ink-3)]">
        {help}
      </p>
    </form>
  );
}
