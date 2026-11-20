'use client';

// T-90/T-92: add documents from the browser: files or a folder go to `my-docs/`, a web page
// becomes a URL source. Used by setup step 3 and Settings › Library.
import { useRef, useState } from 'react';
import { setupApi, type UploadResult } from './api';

export const SKIP_REASONS: Record<UploadResult['skipped'][number]['reason'], string> = {
  unsupported: "this type isn't supported",
  too_large: 'over 50 MB',
  invalid_name: 'the name is not allowed',
};

export function DocumentAdder({
  onChanged,
}: {
  onChanged: (change: Pick<UploadResult, 'saved' | 'skipped'>) => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>([]);
  const [url, setUrl] = useState('');
  const [dragging, setDragging] = useState(false);
  const files = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);

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
      await onChanged(result);
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
          PDF, DOCX, PPTX (with Docling), Markdown, HTML or TXT, up to 50 MB each
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <label className="inline-flex h-11 cursor-pointer items-center rounded-[var(--radius-md)] border border-[var(--rule-strong)] px-4 focus-within:outline-2 focus-within:outline-[var(--accent)]">
            Choose files
            <input
              ref={files}
              type="file"
              multiple
              accept=".pdf,.docx,.pptx,.md,.mdx,.html,.htm,.txt"
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
              await onChanged({ saved: [url.trim()], skipped: [] });
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
    </>
  );
}
