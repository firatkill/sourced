'use client';

// T-90 / R2 Setup 1–4: data, provider key, documents, then confirm and index.
import Link from 'next/link';
import { useRef, useState, type ReactNode } from 'react';
import { setupApi, type SetupStatus, type UploadResult } from './api';
import { IndexStep } from './IndexStep';

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
  const [choice, setChoice] = useState<'own' | 'example'>('own');
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

function KeyField({
  provider,
  onSaved,
}: {
  provider: SetupStatus['providers'][number];
  onSaved: (masked: string) => void;
}) {
  const [value, setValue] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [replacing, setReplacing] = useState(!provider.saved);
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
      </div>
      <p
        id={`${id}-status`}
        role="status"
        className={`mt-2 text-sm ${message?.ok === false ? 'text-[var(--danger)]' : 'text-[var(--ok)]'}`}
      >
        {message?.text}
      </p>
      <p id={`${id}-help`} className="mt-1 text-sm text-[var(--ink-3)]">
        Checking the key makes one free request to {provider.label}. Nothing else is sent until you
        confirm in step 4.
      </p>
    </form>
  );
}

function ProviderStep({
  status,
  onBack,
  onDone,
}: {
  status: SetupStatus;
  onBack?: () => void;
  onDone: () => void;
}) {
  const [saved, setSaved] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(status.providers.map((p) => [p.id, p.saved])),
  );
  const used = status.providers.filter((provider) => provider.used);
  const ready = status.llmMode === 'mock' || used.every((provider) => saved[provider.id]);
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
      </div>
      <Nav back={onBack} next={onDone} disabled={!ready} />
    </>
  );
}

const REASONS: Record<UploadResult['skipped'][number]['reason'], string> = {
  unsupported: "this type isn't supported",
  too_large: 'over 50 MB',
  invalid_name: 'the name is not allowed',
};
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>([]);
  const [skipped, setSkipped] = useState<UploadResult['skipped']>([]);
  const [url, setUrl] = useState('');
  const [dragging, setDragging] = useState(false);
  const files = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);

  async function refresh() {
    onStatus(await setupApi.status());
  }
  async function upload(list: FileList | File[]) {
    const items = [...list].map((file) => ({
      file,
      name: file.webkitRelativePath || file.name,
    }));
    if (!items.length) return;
    setBusy(true);
    setError(null);
    try {
      const result = await setupApi.upload(items);
      setAdded((previous) => [...previous, ...result.saved]);
      setSkipped((previous) => [...previous, ...result.skipped]);
      await refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The upload failed.');
    } finally {
      setBusy(false);
      if (files.current) files.current.value = '';
      if (folder.current) folder.current.value = '';
    }
  }
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
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => {
          setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void upload(event.dataTransfer.files);
        }}
        className={`mt-6 flex flex-col items-center gap-3 rounded-[var(--radius-lg)] border-2 border-dashed p-7 text-center ${dragging ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--rule-strong)] bg-[var(--surface)]'}`}
      >
        <p className="font-semibold">Drop files here</p>
        <p className="text-sm text-[var(--ink-3)]">
          PDF, DOCX, Markdown, HTML or TXT, up to 50 MB each
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <label className="inline-flex h-11 cursor-pointer items-center rounded-[var(--radius-md)] border border-[var(--rule-strong)] px-4 focus-within:outline-2 focus-within:outline-[var(--accent)]">
            Choose files
            <input
              ref={files}
              type="file"
              multiple
              accept=".pdf,.docx,.md,.mdx,.html,.htm,.txt"
              className="sr-only"
              onChange={(event) => {
                if (event.target.files) void upload(event.target.files);
              }}
            />
          </label>
          <label className="inline-flex h-11 cursor-pointer items-center rounded-[var(--radius-md)] border border-[var(--rule-strong)] px-4 focus-within:outline-2 focus-within:outline-[var(--accent)]">
            Choose a folder
            <input
              ref={(node) => {
                folder.current = node;
                node?.setAttribute('webkitdirectory', '');
              }}
              type="file"
              multiple
              className="sr-only"
              onChange={(event) => {
                if (event.target.files) void upload(event.target.files);
              }}
            />
          </label>
        </div>
      </div>
      <form
        className="mt-3 flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          setError(null);
          setupApi
            .addUrl(url.trim())
            .then(async () => {
              setAdded((previous) => [...previous, url.trim()]);
              setUrl('');
              await refresh();
            })
            .catch((failure: unknown) => {
              setError(failure instanceof Error ? failure.message : 'The page was not added.');
            })
            .finally(() => {
              setBusy(false);
            });
        }}
      >
        <label htmlFor="setup-url" className="sr-only">
          Web page address
        </label>
        <input
          id="setup-url"
          type="url"
          value={url}
          onChange={(event) => {
            setUrl(event.target.value);
          }}
          placeholder="Or add a web page: https://…"
          className="h-11 min-w-0 flex-[1_1_320px] rounded-[var(--radius-md)] border border-[var(--rule-strong)] bg-[var(--surface)] px-3"
        />
        <button
          type="submit"
          disabled={busy || !/^https?:\/\/\S+$/.test(url.trim())}
          className="h-11 rounded-[var(--radius-md)] border border-[var(--rule-strong)] px-4 disabled:opacity-60"
        >
          Add page
        </button>
      </form>
      <p role="status" className="mt-3 text-sm text-[var(--ink-2)]">
        {busy ? 'Adding…' : added.length ? `Added ${String(added.length)}.` : ''}
      </p>
      {error && (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {error}
        </p>
      )}
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
                  {item.name} · skipped: {REASONS[item.reason]}
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
        disabled={busy || status.library.sources.length === 0}
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
