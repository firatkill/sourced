'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { FolderPlus, Search, X } from 'lucide-react';
import {
  CHATS_CHANGED,
  chatStore,
  type ChatItem,
  type ChatStorage,
  type ProjectItem,
} from '@/lib/chats/client';
import { SIDEBAR_COPY } from '@/lib/copy';
import { ChatRow } from './ChatRow';
import { ProjectGroup, useChatDrop } from './ProjectGroup';
import { Modal } from '@/components/ask/Modal';

export type SidebarData = {
  chats: ChatItem[];
  projects: ProjectItem[];
  now: string;
  /** T-91: the local profile links to Settings (keys, models, library); others to Appearance. */
  settings?: boolean;
  /** D-154: the hosted demo keeps chats in this browser tab (sessionStorage). */
  storage?: ChatStorage;
};

const OPEN_KEY = 'sourced-open-projects';
const navRow =
  'flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm text-[var(--ink-2)] hover:bg-[var(--rule)] hover:text-[var(--ink)]';
const label = 'flex min-h-9 items-center px-2.5 text-[13px] font-medium text-[var(--ink-3)]';

/** Projects the person opened or closed, kept in this browser (D-153). */
type Folds = { open: string[]; closed: string[] };
const foldListeners = new Set<() => void>();
let foldMemory = '{"open":[],"closed":[]}'; // Used when storage is blocked.
function foldSnapshot(): string {
  try {
    return localStorage.getItem(OPEN_KEY) ?? foldMemory;
  } catch {
    return foldMemory;
  }
}
function parseFolds(raw: string): Folds {
  try {
    const value = JSON.parse(raw) as Partial<Folds>;
    const ids = (list: unknown) =>
      Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string') : [];
    return { open: ids(value.open), closed: ids(value.closed) };
  } catch {
    return { open: [], closed: [] };
  }
}
function saveFolds(folds: Folds) {
  foldMemory = JSON.stringify(folds);
  try {
    localStorage.setItem(OPEN_KEY, foldMemory);
  } catch {
    /* Without storage the choice lasts for this page only. */
  }
  for (const listener of foldListeners) listener();
}
function subscribeFolds(listener: () => void) {
  foldListeners.add(listener);
  return () => {
    foldListeners.delete(listener);
  };
}

/**
 * D-142 / D-153: saved chats with projects as folders among them (like a chat app's sidebar).
 * Search, a new project, open/closed projects, drag a chat into a project, chat actions.
 */
export function ChatSidebar({
  initial,
  activeChatId,
  activeProjectId,
  onNavigate,
}: {
  initial: SidebarData;
  activeChatId?: string | undefined;
  activeProjectId?: string | undefined;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const chatApi = chatStore(initial.storage);
  const [chats, setChats] = useState(initial.chats);
  const [projects, setProjects] = useState(initial.projects);
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ChatItem | null>(null);
  const [deletingProject, setDeletingProject] = useState<ProjectItem | null>(null);
  const activeProject =
    activeProjectId ?? initial.chats.find((chat) => chat.id === activeChatId)?.projectId ?? null;
  // The active project starts open; the server renders only that, the browser adds the rest.
  const folds = parseFolds(
    useSyncExternalStore(subscribeFolds, foldSnapshot, () => '{"open":[],"closed":[]}'),
  );
  const isOpen = (id: string) =>
    folds.open.includes(id) || (id === activeProject && !folds.closed.includes(id));
  const searchRef = useRef(search);

  function setFold(id: string, open: boolean) {
    const current = parseFolds(foldSnapshot());
    saveFolds({
      open: open ? [...new Set([...current.open, id])] : current.open.filter((x) => x !== id),
      closed: open ? current.closed.filter((x) => x !== id) : [...new Set([...current.closed, id])],
    });
  }
  function toggle(id: string) {
    setFold(id, !isOpen(id));
  }

  const refresh = useCallback(async () => {
    try {
      const [nextChats, nextProjects] = await Promise.all([
        chatApi.listChats(searchRef.current),
        chatApi.listProjects(),
      ]);
      setChats(nextChats);
      setProjects(nextProjects);
      setError(null);
    } catch {
      setError(SIDEBAR_COPY.loadError);
    }
  }, [chatApi]);
  useEffect(() => {
    const onChange = () => void refresh();
    window.addEventListener(CHATS_CHANGED, onChange);
    return () => {
      window.removeEventListener(CHATS_CHANGED, onChange);
    };
  }, [refresh]);
  useEffect(() => {
    searchRef.current = search;
    const timer = setTimeout(() => void refresh(), search ? 200 : 0);
    return () => {
      clearTimeout(timer);
    };
  }, [search, refresh]);

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      await refresh();
    } catch {
      setError(SIDEBAR_COPY.saveError);
    }
  }
  function move(chatId: string, projectId: string | null) {
    const chat = chats.find((entry) => entry.id === chatId);
    if (!chat || chat.projectId === projectId) return;
    // Show the move at once; the refresh after saving confirms it.
    setChats((current) =>
      current.map((entry) => (entry.id === chatId ? { ...entry, projectId } : entry)),
    );
    if (projectId && !isOpen(projectId)) setFold(projectId, true);
    void run(() => chatApi.updateChat(chatId, { projectId }));
  }
  const looseDrop = useChatDrop((chatId) => {
    move(chatId, null);
  });

  const row = (chat: ChatItem) => (
    <ChatRow
      key={chat.id}
      chat={chat}
      projects={projects}
      active={chat.id === activeChatId}
      onNavigate={onNavigate}
      onRename={(title) => run(() => chatApi.updateChat(chat.id, { title }))}
      onMove={async (projectId) => {
        move(chat.id, projectId);
        await Promise.resolve();
      }}
      onPin={(pinned) => run(() => chatApi.updateChat(chat.id, { pinned }))}
      onDelete={() => {
        setDeleting(chat);
      }}
    />
  );
  const known = new Set(projects.map((project) => project.id));
  const loose = chats.filter((chat) => !chat.projectId || !known.has(chat.projectId));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        {searching ? (
          <div className="relative">
            <label htmlFor="chat-search" className="sr-only">
              {SIDEBAR_COPY.search}
            </label>
            <Search
              size={15}
              aria-hidden="true"
              className="pointer-events-none absolute top-3 left-2.5 text-[var(--ink-3)]"
            />
            <input
              id="chat-search"
              type="search"
              autoFocus
              value={search}
              placeholder={SIDEBAR_COPY.search}
              onChange={(event) => {
                setSearch(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setSearch('');
                  setSearching(false);
                }
              }}
              className="min-h-10 w-full rounded-md border border-[var(--rule-strong)] bg-transparent pr-10 pl-8 text-sm"
            />
            <button
              type="button"
              aria-label={SIDEBAR_COPY.closeSearch}
              className="absolute top-1 right-1 flex size-8 items-center justify-center rounded-md text-[var(--ink-3)] hover:bg-[var(--rule)]"
              onClick={() => {
                setSearch('');
                setSearching(false);
              }}
            >
              <X size={15} aria-hidden="true" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={navRow}
            onClick={() => {
              setSearching(true);
            }}
          >
            <Search size={16} aria-hidden="true" />
            {SIDEBAR_COPY.searchRow}
          </button>
        )}
        <button
          type="button"
          aria-expanded={adding}
          className={navRow}
          onClick={() => {
            setAdding((value) => !value);
          }}
        >
          <FolderPlus size={16} aria-hidden="true" />
          {SIDEBAR_COPY.newProject}
        </button>
        {adding && (
          <form
            className="px-0.5 pt-1"
            onSubmit={(event) => {
              event.preventDefault();
              const name = projectName.trim();
              if (!name) return;
              void run(async () => {
                const project = await chatApi.createProject(name);
                setProjectName('');
                setAdding(false);
                setFold(project.id, true);
              });
            }}
          >
            <label htmlFor="new-project" className="sr-only">
              {SIDEBAR_COPY.projectName}
            </label>
            <input
              id="new-project"
              autoFocus
              maxLength={80}
              value={projectName}
              placeholder={SIDEBAR_COPY.projectName}
              onChange={(event) => {
                setProjectName(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setAdding(false);
              }}
              className="min-h-10 w-full rounded-md border border-[var(--accent)] bg-[var(--surface)] px-2.5 text-sm"
            />
          </form>
        )}
      </div>

      {error && (
        <p role="alert" className="px-2.5 text-xs text-[var(--danger)]">
          {error}
        </p>
      )}

      {search ? (
        <section aria-label={SIDEBAR_COPY.results}>
          <h2 className={`${label} text-xs!`}>{SIDEBAR_COPY.results}</h2>
          {chats.length === 0 ? (
            <p className="px-2.5 text-sm text-[var(--ink-3)]">{SIDEBAR_COPY.noMatches}</p>
          ) : (
            <ul className="space-y-0.5">{chats.map(row)}</ul>
          )}
        </section>
      ) : (
        <>
          {projects.length > 0 && (
            <section aria-label={SIDEBAR_COPY.projects}>
              <ul className="space-y-0.5">
                {projects.map((project) => {
                  const inside = chats.filter((chat) => chat.projectId === project.id);
                  return (
                    <ProjectGroup
                      key={project.id}
                      project={project}
                      open={isOpen(project.id)}
                      active={project.id === activeProjectId}
                      onToggle={() => {
                        toggle(project.id);
                      }}
                      onNavigate={onNavigate}
                      onDropChat={(chatId) => {
                        move(chatId, project.id);
                      }}
                      onRename={(name) => run(() => chatApi.updateProject(project.id, { name }))}
                      onDelete={() => {
                        setDeletingProject(project);
                      }}
                    >
                      {inside.length === 0 ? (
                        <p className="px-2.5 pb-2 text-xs text-[var(--ink-3)]">
                          {SIDEBAR_COPY.projectEmpty}
                        </p>
                      ) : (
                        <ul className="space-y-0.5 pb-1">{inside.map(row)}</ul>
                      )}
                    </ProjectGroup>
                  );
                })}
              </ul>
            </section>
          )}

          <section
            aria-label={SIDEBAR_COPY.chats}
            {...looseDrop.handlers}
            className={`rounded-lg ${looseDrop.over ? 'bg-[var(--accent-soft)] outline-2 outline-[var(--accent)]' : ''}`}
          >
            <h2 className={`${label} text-xs!`}>{SIDEBAR_COPY.chats}</h2>
            {looseDrop.over && (
              <p className="px-2.5 pb-2 text-xs text-[var(--accent-soft-ink)]">
                {SIDEBAR_COPY.dropOut}
              </p>
            )}
            {loose.length === 0 ? (
              <p className="px-2.5 text-sm text-[var(--ink-3)]">{SIDEBAR_COPY.empty}</p>
            ) : (
              <ul className="space-y-0.5">{loose.map(row)}</ul>
            )}
          </section>
        </>
      )}
      <p className="px-2.5 text-xs text-[var(--ink-3)]">
        {initial.storage === 'session' ? SIDEBAR_COPY.sessionStorage : SIDEBAR_COPY.storage}
      </p>

      {deleting && (
        <Modal
          label={SIDEBAR_COPY.deleteTitle}
          onClose={() => {
            setDeleting(null);
          }}
          className="m-auto w-[min(420px,calc(100vw-32px))] rounded-[var(--radius-lg)] border border-[var(--rule-strong)] bg-[var(--surface)] p-5 text-[var(--ink)]"
        >
          <h2 className="text-lg! font-semibold">{SIDEBAR_COPY.deleteTitle}</h2>
          <p className="mt-2 text-sm text-[var(--ink-2)]">
            <span className="font-medium text-[var(--ink)]">{deleting.title}</span>{' '}
            {SIDEBAR_COPY.deleteBody}
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              autoFocus
              className="min-h-11 rounded-md border border-[var(--rule-strong)] px-4"
              onClick={() => {
                setDeleting(null);
              }}
            >
              {SIDEBAR_COPY.cancel}
            </button>
            <button
              type="button"
              className="min-h-11 rounded-md bg-[var(--danger)] px-4 font-medium text-[var(--surface)]"
              onClick={() => {
                const chat = deleting;
                setDeleting(null);
                void run(async () => {
                  await chatApi.deleteChat(chat.id);
                  if (chat.id === activeChatId) router.push('/');
                });
              }}
            >
              {SIDEBAR_COPY.delete}
            </button>
          </div>
        </Modal>
      )}

      {deletingProject && (
        <Modal
          label={SIDEBAR_COPY.deleteProjectTitle}
          onClose={() => {
            setDeletingProject(null);
          }}
          className="m-auto w-[min(420px,calc(100vw-32px))] rounded-[var(--radius-lg)] border border-[var(--rule-strong)] bg-[var(--surface)] p-5 text-[var(--ink)]"
        >
          <h2 className="text-lg! font-semibold">{SIDEBAR_COPY.deleteProjectTitle}</h2>
          <p className="mt-2 text-sm text-[var(--ink-2)]">
            <span className="font-medium text-[var(--ink)]">{deletingProject.name}</span>.{' '}
            {SIDEBAR_COPY.deleteProjectBody}
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              autoFocus
              className="min-h-11 rounded-md border border-[var(--rule-strong)] px-4"
              onClick={() => {
                setDeletingProject(null);
              }}
            >
              {SIDEBAR_COPY.cancel}
            </button>
            <button
              type="button"
              className="min-h-11 rounded-md bg-[var(--danger)] px-4 font-medium text-[var(--surface)]"
              onClick={() => {
                const project = deletingProject;
                setDeletingProject(null);
                void run(async () => {
                  await chatApi.deleteProject(project.id);
                  if (project.id === activeProjectId) router.push('/');
                });
              }}
            >
              {SIDEBAR_COPY.delete}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
