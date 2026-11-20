'use client';

// T-90 / R2 Setup 1–4: data, provider key, documents, then confirm and index.
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { setupApi, type SetupStatus, type UploadResult } from './api';
import { IndexStep } from './IndexStep';
import { KeyField } from './KeyField';
import { AdvancedSettings } from './AdvancedSettings';
import { DocumentAdder, SKIP_REASONS } from './DocumentAdder';

const STEPS = ['Data', 'Provider', 'Documents', 'Index'] as const;
type Step = 1 | 2 | 3 | 4;

function Stepper({ step, skipped }: { step: Step; skipped: Step[] }) {
  return (
    <ol aria-label="Setup steps" className="flex flex-wrap items-center gap-2 text-sm">
      {STEPS.map((label, index) => {
        const number = (index + 1) as Step;
        const done = number < step;
        const current = number === step;
        return (
          <li
            key={label}
            aria-current={current ? 'step' : undefined}
            className={`flex items-center gap-2 ${current ? 'font-semibold text-[var(--ink)]' : done ? 'text-[var(--ink-2)]' : 'text-[var(--ink-3)]'}`}
          >
            {index > 0 && <span aria-hidden="true" className="h-px w-5 bg-[var(--rule-strong)]" />}
            <span
              aria-hidden="true"
              className={`inline-flex size-6 items-center justify-center rounded-full text-xs ${current ? 'bg-[var(--accent)] text-[var(--accent-ink)]' : done ? 'bg-[var(--accent-soft)] text-[var(--accent-soft-ink)]' : 'border border-[var(--rule-strong)]'}`}
            >
              {done ? '✓' : number}
            </span>
            {label}
            {done && (
              <span className="sr-only">{skipped.includes(number) ? '(skipped)' : '(done)'}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Nav({
  back,
  next,
  nextLabel = 'Continue',
  busy = false,
  disabled = false,
}: {
  back?: (() => void) | undefined;
  next?: (() => void) | undefined;
  nextLabel?: string;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="mt-8 flex items-center justify-between gap-3">
      {back ? (
        <button
          type="button"
          onClick={back}
          className="h-11 rounded-[var(--radius-md)] px-3 text-[var(--ink-2)] hover:text-[var(--ink)]"
        >
          Back
        </button>
      ) : (
        <span />
      )}
      {next && (
        <button
          type="button"
          onClick={next}
          disabled={busy || disabled}
          className="inline-flex h-11 items-center rounded-[var(--radius-md)] bg-[var(--accent)] px-5 font-semibold text-[var(--accent-ink)] disabled:opacity-60"
        >
          {busy ? 'One moment…' : nextLabel}
        </button>
      )}
    </div>
  );
}

function Heading({ step, title, lead }: { step: Step; title: string; lead: ReactNode }) {
  return (
    <>
      <p className="text-sm font-semibold text-[var(--ink-3)]">Step {step} of 4</p>
      <h1 className="mt-2">{title}</h1>
      <p className="mt-2 text-[var(--ink-2)]">{lead}</p>
    </>
  );
}

function Choice({
  name,
  value,
  checked,
  onChange,
  title,
  detail,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  detail: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-4 rounded-[var(--radius-lg)] border p-5 ${checked ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--rule)] bg-[var(--surface)] hover:border-[var(--rule-strong)]'}`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="mt-1 size-[18px] flex-none accent-[var(--accent)]"
      />
      <span className="flex flex-col gap-1">
        <span className="font-semibold">{title}</span>
        <span className="text-sm text-[var(--ink-2)]">{detail}</span>
      </span>
    </label>
  );
}

function DataStep({ status, onDone }: { status: SetupStatus; onDone: (example: boolean) => void }) {
  // An example that is already indexed stays chosen, so Continue never removes it by accident.
  const [choice, setChoice] = useState<'own' | 'example'>(
    status.library.example && status.library.documents > 0 ? 'example' : 'own',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Heading
        step={1}
        title="What should Sourced answer from?"
        lead="Choosing your own documents removes the example from this checkout. Saved chats are kept."
      />
      <fieldset className="mt-8 space-y-3">
        <legend className="sr-only">Data</legend>
        <Choice
          name="data"
          value="own"
          checked={choice === 'own'}
          onChange={() => {
            setChoice('own');
          }}
          title="My own documents"
          detail="PDF, Word, Markdown, HTML or text files, and web pages. You add them in step 3."
        />
        <Choice
          name="data"
          value="example"
          checked={choice === 'example'}
          onChange={() => {
            setChoice('example');
          }}
          title="Try the example first"
          detail={`${String(status.library.sources.length)} example ${status.library.sources.length === 1 ? 'source' : 'sources'} with sample questions. You can switch to your own documents later.`}
        />
      </fieldset>
      {error && (
        <p role="alert" className="mt-4 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}
      <Nav
        busy={busy}
        next={() => {
          setBusy(true);
          setError(null);
          setupApi.chooseData(choice).then(
            () => {
              onDone(choice === 'example');
            },
            (failure: unknown) => {
              setError(failure instanceof Error ? failure.message : 'Try again.');
              setBusy(false);
            },
          );
        }}
      />
    </>
  );
}

function ProviderStep({
  status,
  onStatus,
  onBack,
  onDone,
}: {
  status: SetupStatus;
  onStatus: (status: SetupStatus) => void;
  onBack?: () => void;
  onDone: () => void;
}) {
  // Keys saved on this step; a provider chosen in Advanced settings starts from the server.
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const used = status.providers.filter((provider) => provider.used);
  const ready =
    status.llmMode === 'mock' || used.every((provider) => saved[provider.id] ?? provider.saved);
  return (
    <>
      <Heading
        step={2}
        title="Connect your model provider"
        lead={`Answers use ${status.models.chat}; documents are indexed with ${status.models.embed.split(':').slice(0, 2).join(':')}. You can change models in Settings later.`}
      />
      <div className="mt-8 space-y-6">
        {status.llmMode === 'mock' && (
          <p className="rounded-[var(--radius-md)] bg-[var(--accent-soft)] p-3 text-sm text-[var(--accent-soft-ink)]">
            Mock mode: no provider is called, so no key is needed.
          </p>
        )}
        {status.llmMode !== 'mock' &&
          used.map((provider) => (
            <KeyField
              key={provider.id}
              provider={provider}
              help={`Checking the key makes one free request to ${provider.label}. Nothing else is sent until you confirm in step 4.`}
              onSaved={() => {
                setSaved((previous) => ({ ...previous, [provider.id]: true }));
              }}
            />
          ))}
        {status.ollama.used && (
          <p className="text-sm text-[var(--ink-2)]">
            Ollama runs on this computer at{' '}
            <span className="font-mono">{status.ollama.baseUrl}</span>. Nothing leaves it.
          </p>
        )}
        <AdvancedSettings
          mock={status.llmMode === 'mock'}
          onSaved={() => {
            void setupApi.status().then(onStatus);
          }}
        />
      </div>
      <Nav back={onBack} next={onDone} disabled={!ready} />
    </>
  );
}

function DocumentsStep({
  status,
  onStatus,
  onBack,
  onDone,
}: {
  status: SetupStatus;
  onStatus: (status: SetupStatus) => void;
  onBack: () => void;
  onDone: () => void;
}) {
  const [added, setAdded] = useState<string[]>([]);
  const [skipped, setSkipped] = useState<UploadResult['skipped']>([]);
  return (
    <>
      <Heading
        step={3}
        title="Add your documents"
        lead={
          <>
            Files are copied into the <code>my-docs/</code> folder of this project. Nothing is sent
            anywhere yet.
          </>
        }
      />
      <DocumentAdder
        onChanged={async (change) => {
          setAdded((previous) => [...previous, ...change.saved]);
          setSkipped((previous) => [...previous, ...change.skipped]);
          onStatus(await setupApi.status());
        }}
      />
      {(status.library.sources.length > 0 || skipped.length > 0) && (
        <section
          aria-label="Added documents"
          className="mt-4 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--rule)]"
        >
          <ul>
            {status.library.sources.map((source) => (
              <li
                key={source.id}
                className="flex items-center gap-3 border-b border-[var(--rule)] px-4 py-3 text-sm last:border-b-0"
              >
                <span className="w-14 font-mono text-xs text-[var(--ink-3)] uppercase">
                  {source.type === 'folder' ? 'Files' : 'Web'}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {source.type === 'folder'
                    ? `${source.location}/ · ${String(added.filter((name) => !/^https?:/.test(name)).length)} added now`
                    : source.location}
                </span>
              </li>
            ))}
            {skipped.map((item) => (
              <li
                key={`skipped-${item.name}`}
                className="flex items-center gap-3 border-b border-[var(--rule)] bg-[var(--warn-soft)] px-4 py-3 text-sm text-[var(--warn)] last:border-b-0"
              >
                <span className="min-w-0 flex-1 truncate">
                  {item.name} · skipped: {SKIP_REASONS[item.reason]}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="mt-4 text-sm text-[var(--ink-3)]">
        A large folder? Run <code>./sourced add &lt;folder&gt;</code> in the terminal instead; the
        browser cannot read a folder in place.
      </p>
      <Nav
        back={onBack}
        next={onDone}
        nextLabel="Review cost"
        disabled={status.library.sources.length === 0}
      />
    </>
  );
}

export function SetupWizard({ initial }: { initial: SetupStatus }) {
  const running =
    initial.ingest !== null &&
    (initial.ingest.status === 'preparing' || initial.ingest.status === 'running');
  const [status, setStatus] = useState(initial);
  const [example, setExample] = useState(initial.library.example);
  const [step, setStep] = useState<Step>(running ? 4 : initial.library.example ? 1 : 2);
  const skipped: Step[] = [
    ...(initial.library.example ? [] : [1 as Step]),
    ...(example ? [3 as Step] : []),
  ];
  const done = !status.setupRequired && status.library.documents > 0 && !running && step !== 4;
  return (
    <div className="min-h-dvh bg-[var(--ground)] text-[var(--ink)]">
      <header className="flex min-h-16 flex-wrap items-center justify-between gap-4 border-b border-[var(--rule)] px-5 py-3 sm:px-7">
        <p className="font-semibold">Set up Sourced</p>
        <Stepper step={step} skipped={skipped} />
      </header>
      <main id="content" tabIndex={-1} className="flex justify-center px-4 pt-14 pb-12 sm:px-6">
        <div className="w-full max-w-[680px]">
          {done && (
            <p className="mb-8 rounded-[var(--radius-md)] bg-[var(--ok-soft)] p-3 text-sm text-[var(--ok)]">
              Sourced is already set up with {status.library.documents} documents.{' '}
              <Link href="/" className="underline">
                Go to your chats
              </Link>
              .
            </p>
          )}
          {step === 1 && (
            <DataStep
              status={status}
              onDone={(choseExample) => {
                setExample(choseExample);
                void setupApi.status().then(setStatus);
                setStep(2);
              }}
            />
          )}
          {step === 2 && (
            <ProviderStep
              status={status}
              onStatus={setStatus}
              {...(initial.library.example
                ? {
                    onBack: () => {
                      setStep(1);
                    },
                  }
                : {})}
              onDone={() => {
                setStep(example ? 4 : 3);
              }}
            />
          )}
          {step === 3 && (
            <DocumentsStep
              status={status}
              onStatus={setStatus}
              onBack={() => {
                setStep(2);
              }}
              onDone={() => {
                setStep(4);
              }}
            />
          )}
          {step === 4 && (
            <>
              <Heading
                step={4}
                title="Index your documents"
                lead="Sourced reads each document once and stores its passages in your local database."
              />
              <div className="mt-8">
                <IndexStep initialJob={running ? initial.ingest : null} />
              </div>
              {!running && (
                <Nav
                  back={() => {
                    setStep(example ? 2 : 3);
                  }}
                />
              )}
            </>
          )}
          <p className="mt-12 text-sm text-[var(--ink-3)]">
            Prefer the terminal? Every step here is also a <code>./sourced</code> command; see the
            README.
          </p>
        </div>
      </main>
    </div>
  );
}
