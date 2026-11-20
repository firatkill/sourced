'use client';

import { useState } from 'react';
import { chatApi, type ProjectItem } from '@/lib/chats/client';
import { PROJECT_COPY } from '@/lib/copy';
import { documentCount, scopeLabels, type LibrarySource } from '@/lib/library/format';

/** D-150: limit a project's chats to some library sources, or search everything. */
export function ProjectScope({
  project,
  sources,
  onSaved,
}: {
  project: ProjectItem;
  sources: LibrarySource[];
  onSaved: (project: ProjectItem) => void;
}) {
  const [limited, setLimited] = useState(project.sourceIds !== null);
  const [picked, setPicked] = useState<string[]>(project.sourceIds ?? []);
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  // Sources removed from the library stay listed, so the scope never widens on its own.
  const missing = scopeLabels(project.sourceIds ?? [], sources).filter((entry) => entry.missing);
  const rows = [
    ...sources.map((source) => ({
      id: source.id,
      label: source.label,
      detail: documentCount(source.documents),
    })),
    ...missing.map((entry) => ({
      id: entry.id,
      label: entry.label,
      detail: PROJECT_COPY.scopeMissing,
    })),
  ];
  const next = limited ? picked : null;
  const unchanged =
    JSON.stringify(next === null ? null : [...next].sort()) ===
    JSON.stringify(project.sourceIds === null ? null : [...project.sourceIds].sort());
  const invalid = limited && picked.length === 0;

  async function save() {
    setSaving(true);
    try {
      const saved = await chatApi.updateProject(project.id, { sourceIds: next });
      onSaved(saved);
      setStatus({
        text:
          saved.sourceIds === null
            ? PROJECT_COPY.scopeSavedAll
            : PROJECT_COPY.scopeSaved(saved.sourceIds.length),
        error: false,
      });
    } catch {
      setStatus({ text: PROJECT_COPY.saveError, error: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="project-scope" className="mt-10">
      <h2 id="project-scope" className="mb-1">
        {PROJECT_COPY.scopeHeading}
      </h2>
      <p className="mb-3 text-sm text-[var(--ink-3)]">{PROJECT_COPY.scopeHint}</p>
      {rows.length === 0 ? (
        <p className="text-[var(--ink-3)]">{PROJECT_COPY.scopeEmptyLibrary}</p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!invalid && !unchanged) void save();
          }}
        >
          <fieldset className="space-y-2">
            <legend className="sr-only">{PROJECT_COPY.scopeHeading}</legend>
            {[false, true].map((value) => (
              <label key={String(value)} className="flex min-h-11 items-center gap-3">
                <input
                  type="radio"
                  name="project-scope"
                  checked={limited === value}
                  onChange={() => {
                    setLimited(value);
                    setStatus(null);
                  }}
                  className="size-4 accent-[var(--accent)]"
                />
                {value ? PROJECT_COPY.scopeSome : PROJECT_COPY.scopeAll}
              </label>
            ))}
          </fieldset>
          {limited && (
            <fieldset className="mt-1 ml-7 space-y-1">
              <legend className="sr-only">{PROJECT_COPY.scopeSome}</legend>
              {rows.map((row) => (
                <label key={row.id} className="flex min-h-11 items-center gap-3">
                  <input
                    type="checkbox"
                    checked={picked.includes(row.id)}
                    onChange={(event) => {
                      const on = event.target.checked;
                      setPicked((current) =>
                        on ? [...current, row.id] : current.filter((id) => id !== row.id),
                      );
                      setStatus(null);
                    }}
                    className="size-4 accent-[var(--accent)]"
                  />
                  <span className="font-mono text-sm">{row.label}</span>
                  <span className="text-sm text-[var(--ink-3)]">{row.detail}</span>
                </label>
              ))}
            </fieldset>
          )}
          {invalid && <p className="mt-2 text-sm text-[var(--ink-3)]">{PROJECT_COPY.scopeNone}</p>}
          <button
            type="submit"
            disabled={invalid || unchanged || saving}
            className="mt-3 min-h-11 rounded-md bg-[var(--accent)] px-4 font-medium text-[var(--accent-ink)] disabled:opacity-50"
          >
            {PROJECT_COPY.scopeSave}
          </button>
          <p
            role="status"
            className={`mt-2 text-sm ${status?.error ? 'text-[var(--danger)]' : 'text-[var(--ink-2)]'}`}
          >
            {status?.text}
          </p>
        </form>
      )}
    </section>
  );
}
