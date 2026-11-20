'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Folder, Pencil, Plus, Trash2 } from 'lucide-react';
import { ChatRail } from '@/components/ask/ChatRail';
import { Modal } from '@/components/ask/Modal';
import type { SidebarData } from '@/components/sidebar/ChatSidebar';
import { announceChatsChanged, chatApi, type ChatItem, type ProjectItem } from '@/lib/chats/client';
import { PROJECT_COPY, type CorpusCopy } from '@/lib/copy';
import { updatedAgo, type LibrarySource } from '@/lib/library/format';
import { ProjectScope } from './ProjectScope';

/** T-83 / REDESIGN-v2 §7: a project's page with its chats ("Rename, move and projects"). */
export function ProjectView({
  copy,
  initial,
  project: initialProject,
  chats,
  sources,
  now,
}: {
  copy: CorpusCopy;
  initial: SidebarData;
  project: ProjectItem;
  chats: ChatItem[];
  sources: LibrarySource[];
  now: string;
}) {
  const router = useRouter();
  const [project, setProject] = useState(initialProject);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    try {
      const next = await chatApi.updateProject(project.id, {
        name: name.trim() || project.name,
        description: description.trim() || null,
      });
      setProject(next);
      setEditing(false);
      setError(null);
      announceChatsChanged();
    } catch {
      setError(PROJECT_COPY.saveError);
    }
  }
  return (
    <div className="chat-shell flex h-dvh flex-col md:flex-row">
      <ChatRail
        copy={copy}
        turns={[]}
        busy={false}
        onNew={() => {
          router.push('/');
        }}
        saved={{ initial, activeProjectId: project.id }}
      />
      <main id="content" tabIndex={-1} className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[840px] px-5 py-12 sm:px-8">
          <p className="flex items-center gap-2 text-sm text-[var(--ink-3)]">
            <Folder size={15} aria-hidden="true" />
            {PROJECT_COPY.label}
          </p>
          {editing ? (
            <form
              className="mt-3 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <label className="block text-sm font-medium" htmlFor="project-name">
                {PROJECT_COPY.name}
              </label>
              <input
                id="project-name"
                autoFocus
                maxLength={80}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                }}
                className="min-h-11 w-full rounded-md border border-[var(--rule-strong)] bg-[var(--surface)] px-3"
              />
              <label className="block text-sm font-medium" htmlFor="project-description">
                {PROJECT_COPY.description}
              </label>
              <input
                id="project-description"
                maxLength={300}
                value={description}
                onChange={(event) => {
                  setDescription(event.target.value);
                }}
                className="min-h-11 w-full rounded-md border border-[var(--rule-strong)] bg-[var(--surface)] px-3"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="min-h-11 rounded-md bg-[var(--accent)] px-4 font-medium text-[var(--accent-ink)]"
                >
                  {PROJECT_COPY.save}
                </button>
                <button
                  type="button"
                  className="min-h-11 rounded-md border border-[var(--rule-strong)] px-4"
                  onClick={() => {
                    setName(project.name);
                    setDescription(project.description ?? '');
                    setEditing(false);
                  }}
                >
                  {PROJECT_COPY.cancel}
                </button>
              </div>
            </form>
          ) : (
            <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <h1 className="break-words">{project.name}</h1>
                  <button
                    type="button"
                    aria-label={PROJECT_COPY.edit}
                    className="flex size-11 items-center justify-center rounded-md text-[var(--ink-3)] hover:bg-[var(--rule)]"
                    onClick={() => {
                      setEditing(true);
                    }}
                  >
                    <Pencil size={16} aria-hidden="true" />
                  </button>
                </div>
                {project.description && (
                  <p className="mt-1 text-[var(--ink-2)]">{project.description}</p>
                )}
              </div>
              <Link
                href={`/?project=${project.id}`}
                className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius)] bg-[var(--accent)] px-4 font-medium text-[var(--accent-ink)] hover:no-underline"
              >
                <Plus size={16} aria-hidden="true" />
                {PROJECT_COPY.newChat}
              </Link>
            </div>
          )}
          {error && (
            <p role="alert" className="mt-3 text-sm text-[var(--danger)]">
              {error}
            </p>
          )}

          <ProjectScope project={project} sources={sources} onSaved={setProject} />

          <section aria-labelledby="project-chats" className="mt-10">
            <h2 id="project-chats" className="mb-3">
              {PROJECT_COPY.chats}{' '}
              <span className="font-normal text-[var(--ink-3)]">{chats.length}</span>
            </h2>
            {chats.length === 0 ? (
              <p className="text-[var(--ink-3)]">{PROJECT_COPY.empty}</p>
            ) : (
              <ul className="space-y-2">
                {chats.map((chat) => (
                  <li key={chat.id}>
                    <Link
                      href={`/c/${chat.id}`}
                      className="flex items-center gap-4 rounded-[var(--radius)] border border-[var(--rule)] bg-[var(--surface)] px-4 py-3 text-[var(--ink)] hover:border-[var(--rule-strong)] hover:no-underline"
                    >
                      <span className="min-w-0 flex-1 truncate font-medium">{chat.title}</span>
                      <span className="text-sm whitespace-nowrap text-[var(--ink-3)]">
                        {updatedAgo(chat.updatedAt, new Date(now))}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="mt-12 border-t border-[var(--rule)] pt-6">
            <button
              type="button"
              className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-[var(--danger)] hover:bg-[var(--danger-soft)]"
              onClick={() => {
                setDeleting(true);
              }}
            >
              <Trash2 size={16} aria-hidden="true" />
              {PROJECT_COPY.delete}
            </button>
          </div>
        </div>
      </main>
      {deleting && (
        <Modal
          label={PROJECT_COPY.deleteTitle}
          onClose={() => {
            setDeleting(false);
          }}
          className="m-auto w-[min(420px,calc(100vw-32px))] rounded-[var(--radius-lg)] border border-[var(--rule-strong)] bg-[var(--surface)] p-5 text-[var(--ink)]"
        >
          <h2 className="text-lg! font-semibold">{PROJECT_COPY.deleteTitle}</h2>
          <p className="mt-2 text-sm text-[var(--ink-2)]">{PROJECT_COPY.deleteBody}</p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              autoFocus
              className="min-h-11 rounded-md border border-[var(--rule-strong)] px-4"
              onClick={() => {
                setDeleting(false);
              }}
            >
              {PROJECT_COPY.cancel}
            </button>
            <button
              type="button"
              className="min-h-11 rounded-md bg-[var(--danger)] px-4 font-medium text-[var(--surface)]"
              onClick={() => {
                void chatApi.deleteProject(project.id).then(
                  () => {
                    router.push('/');
                    router.refresh();
                  },
                  () => {
                    setDeleting(false);
                    setError(PROJECT_COPY.saveError);
                  },
                );
              }}
            >
              {PROJECT_COPY.deleteConfirm}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
