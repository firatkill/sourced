'use client';

// D-152: optional Docling reader, offered in setup step 3 and in Settings › Library. The
// browser records the choice; the terminal downloads and starts Docling (the app container
// cannot start containers), and this card follows its status until it is ready.
import { useEffect, useState } from 'react';
import type { DoclingInfo } from '@/lib/setup/docling';
import { setupApi } from './api';

const STATE_TEXT: Record<DoclingInfo['service'], string> = {
  ready: 'Docling is running. Your next indexing run reads PDF, Word and PowerPoint files with it.',
  starting: 'Docling is starting. It loads its models first, which takes a minute or two.',
  off: 'Docling is not running yet. Run this in your terminal to download and start it:',
};

export function DoclingOption({
  indexed = false,
  onChanged,
}: {
  /** Documents are already indexed: a change reads those files again on the next run. */
  indexed?: boolean;
  onChanged?: (info: DoclingInfo) => void;
}) {
  const [info, setInfo] = useState<DoclingInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  // Opens by itself only when Docling is already chosen; afterwards the person decides.
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setupApi.docling().then(
      (loaded) => {
        if (cancelled) return;
        setInfo(loaded);
        if (loaded.engine === 'docling') setOpen(true);
      },
      (cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Try again.');
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // Follow the terminal's download and start until Docling answers.
  const waiting = info?.engine === 'docling' && info.service !== 'ready';
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => {
      setupApi.docling().then(
        (loaded) => {
          setInfo(loaded);
          if (loaded.service === 'ready') onChanged?.(loaded);
        },
        () => undefined,
      );
    }, 5000);
    return () => {
      clearInterval(timer);
    };
  }, [waiting, onChanged]);

  async function choose(engine: DoclingInfo['engine']) {
    const previous = info;
    // The radio moves at once; the saved answer (with the live status) replaces it.
    setInfo((current) => (current ? { ...current, engine } : current));
    setSaving(true);
    setError(null);
    try {
      const saved = await setupApi.setDocling(engine);
      setInfo(saved);
      onChanged?.(saved);
    } catch (cause) {
      setInfo(previous);
      setError(cause instanceof Error ? cause.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <details
      open={open}
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
      }}
      className="group rounded-[var(--radius-lg)] border border-[var(--rule)] bg-[var(--surface)]"
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-semibold [&::-webkit-details-marker]:hidden">
        <span>
          Better reading for PDF and Office files{' '}
          <span className="font-normal text-[var(--ink-3)]">(optional)</span>
        </span>
        <span
          aria-hidden="true"
          className="text-[var(--ink-3)] transition-transform group-open:rotate-90"
        >
          ›
        </span>
      </summary>
      <div className="space-y-4 border-t border-[var(--rule)] p-4 text-sm">
        <p className="text-[var(--ink-2)]">
          Docling reads scanned pages, tables, columns and PowerPoint slides more faithfully than
          the built-in readers. It runs on this computer; your files are not sent anywhere.
          {info &&
            ` It is a one-time download of about ${String(info.downloadGb)} GB (${String(info.diskGb)} GB on disk), and indexing PDFs gets slower.`}
        </p>
        {error && (
          <p role="alert" className="text-[var(--danger)]">
            {error}
          </p>
        )}
        {!info && !error && (
          <p role="status" className="text-[var(--ink-3)]">
            Checking Docling…
          </p>
        )}
        {info && (
          <>
            <fieldset className="space-y-1" aria-busy={saving}>
              <legend className="sr-only">How files are read</legend>
              {(['builtin', 'docling'] as const).map((engine) => (
                <label key={engine} className="flex min-h-11 items-center gap-3">
                  <input
                    type="radio"
                    name="docling-engine"
                    checked={info.engine === engine}
                    onChange={() => {
                      if (!saving) void choose(engine);
                    }}
                    className="size-4 accent-[var(--accent)]"
                  />
                  {engine === 'builtin'
                    ? 'Built-in readers (no download)'
                    : 'Docling (PDF, Word and PowerPoint)'}
                </label>
              ))}
            </fieldset>
            {info.engine === 'docling' && (
              <div role="status" className="space-y-2">
                <p
                  className={info.service === 'ready' ? 'text-[var(--ok)]' : 'text-[var(--ink-2)]'}
                >
                  {STATE_TEXT[info.service]}
                </p>
                {info.service === 'off' && (
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="rounded-[var(--radius-sm)] bg-[var(--accent-soft)] px-2 py-1 font-mono">
                      {info.command}
                    </code>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(info.command).then(() => {
                          setCopied(true);
                        });
                      }}
                      className="inline-flex h-11 items-center rounded-[var(--radius-md)] border border-[var(--rule-strong)] px-3 font-semibold"
                    >
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                )}
              </div>
            )}
            {info.engine === 'builtin' && (
              <p className="text-[var(--ink-3)]">
                PowerPoint files are skipped with the built-in readers.
              </p>
            )}
            {indexed && (
              <p className="text-[var(--ink-3)]">
                Changing this reads your PDF, Word and PowerPoint files again the next time you
                index; only passages that changed are embedded again.
              </p>
            )}
          </>
        )}
      </div>
    </details>
  );
}
