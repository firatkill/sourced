'use client';

// T-92 / R2 Settings › Library: what Sourced answers from. Add files or pages, remove a
// source (its indexed documents go; files on disk stay), remove the example, re-index.
import { useState } from 'react';
import { setupApi, settingsApi, type SetupStatus, type UploadResult } from '@/components/setup/api';
import { DocumentAdder, SKIP_REASONS } from '@/components/setup/DocumentAdder';
import { IndexStep } from '@/components/setup/IndexStep';
import { DoclingOption } from '@/components/setup/DoclingOption';
import { ConfirmButton } from './Confirm';

export function LibraryManager({ initial }: { initial: SetupStatus }) {
  const [status, setStatus] = useState(initial);
  const [skipped, setSkipped] = useState<UploadResult['skipped']>([]);
  const [message, setMessage] = useState('');
  const running =
    initial.ingest !== null &&
    (initial.ingest.status === 'preparing' || initial.ingest.status === 'running');
  const [indexing, setIndexing] = useState(running);
  const [pending, setPending] = useState(false);
  const refresh = async () => {
    setStatus(await setupApi.status());
  };
  const { library } = status;
  return (
    <div className="max-w-3xl">
      <h1>Library</h1>
      <p className="text-[var(--ink-2)]">
        {library.documents} indexed {library.documents === 1 ? 'document' : 'documents'} from{' '}
        {library.sources.length} {library.sources.length === 1 ? 'source' : 'sources'}. Removing a
        source removes its passages from the index; your files are not touched.
      </p>
      <p role="status" className="mt-2 text-sm text-[var(--ok)]">
        {message}
      </p>

      {library.example && (
        <section
          aria-labelledby="library-example"
          className="mt-8 rounded-[var(--radius-lg)] border border-[var(--rule)] bg-[var(--surface)] p-5"
        >
          <h2 id="library-example" className="text-lg font-semibold">
            You are using the example
          </h2>
          <p className="mt-1 text-sm text-[var(--ink-2)]">
            Remove it to start from your own documents. Saved chats are kept.
          </p>
          <div className="mt-4">
            <ConfirmButton
              label="Remove the example"
              question="Remove the example and its index?"
              confirmLabel="Remove the example"
              onConfirm={async () => {
                const result = (await setupApi.chooseData('own')) as { removedDocuments: number };
                setMessage(
                  `Removed the example and ${String(result.removedDocuments)} indexed documents.`,
                );
                await refresh();
              }}
            />
          </div>
        </section>
      )}

      <h2 className="mt-10 mb-3 text-lg font-semibold">Sources</h2>
      {library.sources.length === 0 ? (
        <p className="text-[var(--ink-2)]">No sources yet. Add files or a web page below.</p>
      ) : (
        <ul className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--rule)] bg-[var(--surface)]">
          {library.sources.map((source) => (
            <li
              key={source.id}
              className="flex flex-wrap items-center gap-4 border-b border-[var(--rule)] p-4 last:border-b-0"
            >
              <div className="min-w-0 flex-[1_1_260px]">
                <p className="font-semibold">{source.id}</p>
                <p className="truncate text-sm text-[var(--ink-3)]">
                  {source.type === 'folder' ? 'Files' : source.type === 'git' ? 'Git' : 'Web'} ·{' '}
                  {source.location} · {source.documents} indexed
                </p>
              </div>
              <ConfirmButton
                label={`Remove ${source.id}`}
                question={`Remove ${source.id} and its ${String(source.documents)} indexed documents?`}
                confirmLabel="Remove"
                onConfirm={async () => {
                  const result = await settingsApi.removeSource(source.id);
                  setMessage(
                    `Removed ${source.id} and ${String(result.removedDocuments)} indexed documents.`,
                  );
                  await refresh();
                }}
              />
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-10 mb-3 text-lg font-semibold">Add documents</h2>
      <DocumentAdder
        onChanged={async (change) => {
          setSkipped((previous) => [...previous, ...change.skipped]);
          if (change.saved.length) setPending(true);
          await refresh();
        }}
      />
      {skipped.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm text-[var(--warn)]">
          {skipped.map((item) => (
            <li key={`skipped-${item.name}`}>
              {item.name} · skipped: {SKIP_REASONS[item.reason]}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6">
        <DoclingOption
          indexed={library.documents > 0}
          onChanged={() => {
            setPending(true);
          }}
        />
      </div>

      <section aria-labelledby="library-index" className="mt-10">
        <h2 id="library-index" className="mb-3 text-lg font-semibold">
          Index
        </h2>
        {indexing ? (
          <div className="rounded-[var(--radius-lg)] border border-[var(--rule)] bg-[var(--surface)] p-5">
            <IndexStep
              initialJob={running ? initial.ingest : null}
              doneHref="/settings/library"
              doneLabel="Done"
            />
          </div>
        ) : (
          <>
            <p className="mb-3 text-sm text-[var(--ink-2)]">
              {pending
                ? 'New documents are added to the library but not indexed yet.'
                : 'Re-index to pick up files you changed or added on disk. Unchanged documents are skipped.'}
            </p>
            <button
              type="button"
              disabled={library.sources.length === 0}
              onClick={() => {
                setIndexing(true);
              }}
              className="h-11 rounded-[var(--radius-md)] bg-[var(--accent)] px-5 font-semibold text-[var(--accent-ink)] disabled:opacity-60"
            >
              {pending ? 'Index new documents' : 'Re-index'}
            </button>
          </>
        )}
      </section>
    </div>
  );
}
