'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Folder, Plus, Search } from 'lucide-react';
import { CHATS_CHANGED, chatApi, type ChatItem, type ProjectItem } from '@/lib/chats/client';
import { groupChats } from '@/lib/chats/groups';
import { SIDEBAR_COPY } from '@/lib/copy';
import { ChatRow } from './ChatRow';
import { Modal } from '@/components/ask/Modal';

export type SidebarData = { chats: ChatItem[]; projects: ProjectItem[]; now: string };

const never = () => () => {};

/** D-142 / REDESIGN-v2 §7: saved chats grouped by day, projects, search and chat actions. */
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
  const [chats, setChats] = useState(initial.chats);
  const [projects, setProjects] = useState(initial.projects);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ChatItem | null>(null);
  const searchRef = useRef(search);
  // Server HTML groups by UTC days; after hydration the browser's own calendar is used.
  const local = useSyncExternalStore(
    never,
    () => true,
    () => false,
  );
  const now = local ? new Date() : new Date(initial.now);

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
  }, []);
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
  const groups = groupChats(chats, now, local);
  return (
    <div className="space-y-5">
      <section aria-labelledby="projects-heading" className="space-y-1">
        <div className="flex items-center justify-between pl-2.5">
          <h2
            id="projects-heading"
            className="text-xs! font-semibold tracking-[0.04em] text-[var(--ink-3)] uppercase"
          >
            {SIDEBAR_COPY.projects}
          </h2>
          <button
            type="button"
            aria-label={SIDEBAR_COPY.newProject}
            aria-expanded={adding}
            className="flex size-9 items-center justify-center rounded-md text-[var(--ink-3)] hover:bg-[var(--rule)] hover:text-[var(--ink)]"
            onClick={() => {
              setAdding((value) => !value);
            }}
          >
            <Plus size={16} aria-hidden="true" />
          </button>
        </div>
        {adding && (
          <form
            className="px-1"
            onSubmit={(event) => {
              event.preventDefault();
              const name = projectName.trim();
              if (!name) return;
              void run(async () => {
                await chatApi.createProject(name);
                setProjectName('');
                setAdding(false);
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
        {projects.length === 0 && !adding ? (
          <p className="px-2.5 text-xs text-[var(--ink-3)]">{SIDEBAR_COPY.noProjects}</p>
        ) : (
          <ul className="space-y-0.5">
            {projects.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/p/${project.id}`}
                  {...(onNavigate ? { onClick: onNavigate } : {})}
                  aria-current={activeProjectId === project.id ? 'page' : undefined}
                  className={`flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 text-sm hover:bg-[var(--rule)] hover:no-underline ${activeProjectId === project.id ? 'bg-[var(--rule)] font-medium text-[var(--ink)]' : 'text-[var(--ink-2)]'}`}
                >
                  <Folder size={15} aria-hidden="true" className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{project.name}</span>
                  <span className="text-xs text-[var(--ink-3)]">{project.chats}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

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
          value={search}
          placeholder={SIDEBAR_COPY.search}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
          className="min-h-10 w-full rounded-md border border-[var(--rule-strong)] bg-transparent pr-2 pl-8 text-sm"
        />
      </div>

      <section aria-label={SIDEBAR_COPY.chats} className="space-y-4">
        {error && (
          <p role="alert" className="px-2.5 text-xs text-[var(--danger)]">
            {error}
          </p>
        )}
        {chats.length === 0 ? (
          <p className="px-2.5 text-[var(--ink-3)]">
            {search ? SIDEBAR_COPY.noMatches : SIDEBAR_COPY.empty}
          </p>
        ) : (
          groups.map(({ group, chats: list }) => (
            <div key={group} className="space-y-0.5">
              <h2 className="px-2.5 pb-1 text-xs! font-semibold text-[var(--ink-3)]">
                {SIDEBAR_COPY.groups[group]}
              </h2>
              <ul className="space-y-0.5">
                {list.map((chat) => (
                  <ChatRow
                    key={chat.id}
                    chat={chat}
                    projects={projects}
                    active={chat.id === activeChatId}
                    onNavigate={onNavigate}
                    onRename={(title) => run(() => chatApi.updateChat(chat.id, { title }))}
                    onMove={(projectId) => run(() => chatApi.updateChat(chat.id, { projectId }))}
                    onPin={(pinned) => run(() => chatApi.updateChat(chat.id, { pinned }))}
                    onDelete={() => {
                      setDeleting(chat);
                    }}
                  />
                ))}
              </ul>
            </div>
          ))
        )}
        <p className="px-2.5 text-xs text-[var(--ink-3)]">{SIDEBAR_COPY.storage}</p>
      </section>

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
    </div>
  );
}
