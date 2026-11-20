'use client';

// Setup step 2, Advanced settings: choose the answer, quality-check and embedding models
// before anything is indexed. Closed by default; the defaults suit most people.
import { useState } from 'react';
import { ModelSelect } from '@/components/settings/ModelSelect';
import { setupApi, type ModelOptions } from './api';

type Choice = { chat: string; judge: string; embed: string };

export function AdvancedSettings({ onSaved }: { onSaved: () => void }) {
  const [options, setOptions] = useState<ModelOptions | null>(null);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function load() {
    if (options) return;
    setLoadError(null);
    setupApi.models().then(
      (loaded) => {
        setOptions(loaded);
        setChoice({
          chat: loaded.current.chat,
          judge: loaded.current.judge,
          embed: loaded.current.embed,
        });
      },
      (error: unknown) => {
        setLoadError(error instanceof Error ? error.message : 'Could not load the models.');
      },
    );
  }

  const changed =
    options !== null &&
    choice !== null &&
    (choice.chat !== options.current.chat ||
      choice.judge !== options.current.judge ||
      choice.embed !== options.current.embed);
  const set = (role: keyof Choice) => (value: string) => {
    setMessage(null);
    setChoice((previous) => (previous ? { ...previous, [role]: value } : previous));
  };

  async function save() {
    if (!options || !choice) return;
    setSaving(true);
    setMessage(null);
    try {
      const saved = await setupApi.setupModels({
        ...(choice.chat !== options.current.chat ? { chat: choice.chat } : {}),
        ...(choice.judge !== options.current.judge ? { judge: choice.judge } : {}),
        ...(choice.embed !== options.current.embed ? { embed: choice.embed } : {}),
      });
      setOptions(saved);
      setMessage({ ok: true, text: 'Models saved. Add a key above for any new provider.' });
      onSaved();
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : 'Try again.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <details
      className="group rounded-[var(--radius-lg)] border border-[var(--rule)] bg-[var(--surface)]"
      onToggle={(event) => {
        if (event.currentTarget.open) load();
      }}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-semibold [&::-webkit-details-marker]:hidden">
        Advanced settings
        <span
          aria-hidden="true"
          className="text-[var(--ink-3)] transition-transform group-open:rotate-90"
        >
          ›
        </span>
      </summary>
      <div className="space-y-6 border-t border-[var(--rule)] p-4">
        <p className="text-sm text-[var(--ink-2)]">
          The defaults suit most documents. Choose other models here before indexing; you can change
          them later in Settings, but a new embedding model then re-indexes everything.
        </p>
        {loadError && (
          <p role="alert" className="text-sm text-[var(--danger)]">
            {loadError}
          </p>
        )}
        {!options && !loadError && (
          <p role="status" className="text-sm text-[var(--ink-3)]">
            Loading models…
          </p>
        )}
        {options && choice && (
          <>
            <ModelSelect
              id="setup-model-chat"
              role="chat"
              allowMissingKey
              label="Answer model"
              hint="Writes each answer."
              options={options.chat}
              value={choice.chat}
              onChange={set('chat')}
            />
            <ModelSelect
              id="setup-model-judge"
              role="chat"
              allowMissingKey
              label="Quality-check model"
              hint="Grades answers when you run an evaluation."
              options={options.chat}
              value={choice.judge}
              onChange={set('judge')}
            />
            <ModelSelect
              id="setup-model-embed"
              role="embed"
              allowMissingKey
              label="Embedding model"
              hint="Turns your documents into searchable passages."
              options={options.embed}
              value={choice.embed}
              onChange={set('embed')}
            />
            {message && (
              <p
                role={message.ok ? 'status' : 'alert'}
                className={`text-sm ${message.ok ? 'text-[var(--ok)]' : 'text-[var(--danger)]'}`}
              >
                {message.text}
              </p>
            )}
            <p className="text-sm text-[var(--ink-3)]">
              Passage size and search depth are best tuned later, against an evaluation: ask your
              coding agent to use the <code>sourced-tune</code> skill.
            </p>
            <button
              type="button"
              onClick={() => {
                void save();
              }}
              disabled={!changed || saving}
              className="inline-flex h-11 items-center rounded-[var(--radius-md)] border border-[var(--rule-strong)] bg-[var(--surface)] px-4 font-semibold disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save models'}
            </button>
          </>
        )}
      </div>
    </details>
  );
}
