'use client';

// T-91 / R2 Settings › Models and keys: provider keys (masked), Ollama, and the models for
// answers, quality checks and search. Answer and check models apply on save; a new
// embedding model shows its rebuild estimate first and rebuilds after the person confirms.
import { useEffect, useState } from 'react';
import {
  setupApi,
  type Estimate,
  type IngestProgress,
  type ModelOptions,
  type SetupStatus,
} from '@/components/setup/api';
import { IndexStep, money } from '@/components/setup/IndexStep';
import { KeyField } from '@/components/setup/KeyField';
import { ModelSelect } from './ModelSelect';

type Provider = SetupStatus['providers'][number];

function ProviderRow({
  provider,
  onChange,
}: {
  provider: Provider;
  onChange: (provider: Provider) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (editing || !provider.saved)
    return (
      <li className="border-b border-[var(--rule)] p-4 last:border-b-0">
        <KeyField
          provider={{ ...provider, saved: false }}
          startOpen
          help={
            provider.used
              ? `Your configuration uses ${provider.label}. Checking the key makes one free request.`
              : `Add a key to use ${provider.label} models. Checking it makes one free request.`
          }
          onCancel={
            provider.saved
              ? () => {
                  setEditing(false);
                }
              : undefined
          }
          onSaved={(masked) => {
            setEditing(false);
            onChange({ ...provider, saved: true, masked });
          }}
        />
      </li>
    );
  return (
    <li className="flex flex-wrap items-center gap-4 border-b border-[var(--rule)] p-4 last:border-b-0">
      <div className="min-w-0 flex-[1_1_240px]">
        <p className="flex items-center gap-2 font-semibold">
          {provider.label}
          <span className="rounded-full bg-[var(--ok-soft)] px-2 text-xs font-medium text-[var(--ok)]">
            Connected
          </span>
        </p>
        <p className="mt-1 font-mono text-sm text-[var(--ink-3)]">{provider.masked}</p>
        {error && (
          <p role="alert" className="mt-1 text-sm text-[var(--danger)]">
            {error}
          </p>
        )}
      </div>
      {confirming ? (
        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label={`Remove the ${provider.label} key?`}
        >
          <span className="text-sm">
            Remove the key?{provider.used ? ' Answers that use it stop working.' : ''}
          </span>
          <button
            type="button"
            onClick={() => {
              setupApi.removeKey(provider.id).then(
                () => {
                  setConfirming(false);
                  onChange({ ...provider, saved: false, masked: null });
                },
                (failure: unknown) => {
                  setError(failure instanceof Error ? failure.message : 'The key was not removed.');
                },
              );
            }}
            className="h-11 rounded-[var(--radius-md)] bg-[var(--danger)] px-4 text-sm font-semibold text-[var(--ground)]"
          >
            Remove
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirming(false);
            }}
            className="h-11 rounded-[var(--radius-md)] px-3 text-sm text-[var(--ink-2)]"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setEditing(true);
            }}
            className="h-11 rounded-[var(--radius-md)] border border-[var(--rule-strong)] px-4 text-sm"
          >
            Replace key
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirming(true);
            }}
            className="h-11 rounded-[var(--radius-md)] border border-[var(--rule-strong)] px-4 text-sm text-[var(--danger)]"
          >
            Remove
          </button>
        </div>
      )}
    </li>
  );
}

function OllamaRow({ baseUrl }: { baseUrl: string }) {
  const [state, setState] = useState<{ running: boolean; models: string[] } | null>(null);
  const check = () => {
    setState(null);
    setupApi.ollama().then(setState, () => {
      setState({ running: false, models: [] });
    });
  };
  useEffect(() => {
    let current = true;
    setupApi.ollama().then(
      (value) => {
        if (current) setState(value);
      },
      () => {
        if (current) setState({ running: false, models: [] });
      },
    );
    return () => {
      current = false;
    };
  }, []);
  return (
    <li className="flex flex-wrap items-center gap-4 p-4">
      <div className="min-w-0 flex-[1_1_240px]">
        <p className="font-semibold">
          Ollama{' '}
          <span className="text-xs font-normal text-[var(--ink-3)]">runs on this computer</span>
        </p>
        <p role="status" className="mt-1 text-sm text-[var(--ink-2)]">
          {state === null
            ? 'Checking…'
            : state.running
              ? `Running at ${baseUrl} with ${String(state.models.length)} ${state.models.length === 1 ? 'model' : 'models'}.`
              : `Not running at ${baseUrl}. Start Ollama to keep documents and questions on this computer.`}
        </p>
      </div>
      <button
        type="button"
        onClick={check}
        className="h-11 rounded-[var(--radius-md)] border border-[var(--rule-strong)] px-4 text-sm"
      >
        Check again
      </button>
    </li>
  );
}

export function ModelsAndKeys({
  status,
  initialModels,
}: {
  status: SetupStatus;
  initialModels: ModelOptions;
}) {
  const [providers, setProviders] = useState(status.providers);
  const [models, setModels] = useState(initialModels);
  const [chat, setChat] = useState(initialModels.current.chat);
  const [judge, setJudge] = useState(initialModels.current.judge);
  const [embed, setEmbed] = useState(initialModels.current.embed);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rebuild, setRebuild] = useState<IngestProgress | null>(null);

  const embedChanged = embed !== models.current.embed;
  const changes =
    Number(chat !== models.current.chat) +
    Number(judge !== models.current.judge) +
    Number(embedChanged);

  async function refreshModels() {
    const next = await setupApi.models();
    setModels(next);
    setChat(next.current.chat);
    setJudge(next.current.judge);
    setEmbed(next.current.embed);
  }
  function chooseEmbedding(value: string) {
    setEmbed(value);
    setEstimate(null);
    setEstimateError(null);
    if (value === models.current.embed) return;
    setupApi.estimateEmbedding(value).then(setEstimate, (failure: unknown) => {
      setEstimateError(
        failure instanceof Error ? failure.message : 'Could not estimate the rebuild.',
      );
    });
  }
  async function save() {
    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      if (chat !== models.current.chat || judge !== models.current.judge) {
        const next = await setupApi.saveModels({
          ...(chat !== models.current.chat ? { chat } : {}),
          ...(judge !== models.current.judge ? { judge } : {}),
        });
        setModels(next);
      }
      if (embedChanged) {
        const { job } = await setupApi.changeEmbedding(embed);
        setRebuild(job);
      } else setSaved('Saved. The next answer uses the new model.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The changes were not saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl pb-28">
      <h1>Models and keys</h1>
      <p className="text-[var(--ink-2)]">
        Saved on this computer. Keys go to <code>.env.local</code> and are never shown again in
        full.
      </p>

      <h2 className="mt-10 mb-3 text-lg font-semibold">Providers</h2>
      <ul className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--rule)] bg-[var(--surface)]">
        {providers.map((provider) => (
          <ProviderRow
            key={provider.id}
            provider={provider}
            onChange={(next) => {
              setProviders((list) => list.map((item) => (item.id === next.id ? next : item)));
              void refreshModels();
            }}
          />
        ))}
        <OllamaRow baseUrl={status.ollama.baseUrl} />
      </ul>

      <h2 className="mt-10 mb-3 text-lg font-semibold">Models</h2>
      {rebuild ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--rule)] bg-[var(--surface)] p-5">
          <IndexStep initialJob={rebuild} rebuild doneHref="/settings" doneLabel="Done" />
        </div>
      ) : (
        <div className="space-y-6 rounded-[var(--radius-lg)] border border-[var(--rule)] bg-[var(--surface)] p-5">
          <ModelSelect
            id="model-chat"
            label="Answers"
            hint="Writes each answer from the passages."
            options={models.chat}
            value={chat}
            onChange={setChat}
          />
          <ModelSelect
            id="model-judge"
            label="Quality checks"
            hint="Grades answers when you run an evaluation. Not used for chat."
            options={models.chat}
            value={judge}
            onChange={setJudge}
          />
          <div className="space-y-3">
            <ModelSelect
              id="model-embed"
              label="Search (embeddings)"
              hint="Turns documents and questions into vectors."
              options={models.embed}
              value={embed}
              onChange={chooseEmbedding}
              warn={embedChanged}
            />
            {embedChanged && (
              <p
                role="status"
                className="rounded-[var(--radius-md)] bg-[var(--warn-soft)] p-3 text-sm text-[var(--warn)]"
              >
                {estimateError ??
                  (estimate
                    ? `The index has to be rebuilt for this model: ${String(estimate.documents)} ${estimate.documents === 1 ? 'document' : 'documents'}, about ${money(estimate.estimatedCostUsd)}. Chats stay. Answers pause until the rebuild finishes.`
                    : 'Estimating the rebuild… nothing is sent anywhere yet.')}
              </p>
            )}
          </div>
        </div>
      )}
      <p className="mt-3 text-sm text-[var(--ink-3)]">
        Prices for cost estimates live in <code>pricing</code> in <code>sourced.config.ts</code>.
        Ports and the database address stay in <code>.env.local</code>: the app needs them before it
        starts.
      </p>
      <p role="status" className="mt-3 text-sm text-[var(--ok)]">
        {saved}
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}

      {changes > 0 && !rebuild && (
        <div className="fixed inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-5 md:left-[280px]">
          <div
            role="region"
            aria-label="Unsaved changes"
            className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--rule-strong)] bg-[var(--surface)] py-2 pr-2 pl-4 shadow-lg"
          >
            <span className="text-sm">
              {changes} unsaved {changes === 1 ? 'change' : 'changes'}
            </span>
            <button
              type="button"
              onClick={() => {
                setChat(models.current.chat);
                setJudge(models.current.judge);
                setEmbed(models.current.embed);
                setEstimate(null);
                setEstimateError(null);
              }}
              className="h-11 rounded-[var(--radius-md)] px-3 text-sm text-[var(--ink-2)]"
            >
              Discard
            </button>
            <button
              type="button"
              disabled={saving || (embedChanged && estimate === null)}
              onClick={() => {
                void save();
              }}
              className="h-11 rounded-[var(--radius-md)] bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-ink)] disabled:opacity-60"
            >
              {saving
                ? 'Saving…'
                : embedChanged
                  ? `Save and rebuild index · ${money(estimate?.estimatedCostUsd ?? null)}`
                  : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
