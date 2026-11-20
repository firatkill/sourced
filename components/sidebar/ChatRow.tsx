'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import {
  Check,
  ChevronLeft,
  Folder,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Trash2,
} from 'lucide-react';
import type { ChatItem, ProjectItem } from '@/lib/chats/client';
import { SIDEBAR_COPY } from '@/lib/copy';
import { CHAT_DRAG_TYPE } from './useMenu';

type Props = {
  chat: ChatItem;
  projects: ProjectItem[];
  active: boolean;
  onNavigate?: (() => void) | undefined;
  onRename: (title: string) => Promise<void>;
  onMove: (projectId: string | null) => Promise<void>;
  onPin: (pinned: boolean) => Promise<void>;
  onDelete: () => void;
};

const item =
  'flex min-h-10 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm hover:bg-[var(--rule)] focus-visible:bg-[var(--rule)]';

/** One saved chat: link, inline rename and an options menu (REDESIGN-v2 §7). */
export function ChatRow({
  chat,
  projects,
  active,
  onNavigate,
  onRename,
  onMove,
  onPin,
  onDelete,
}: Props) {
  const [menu, setMenu] = useState<'closed' | 'main' | 'move'>('closed');
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(chat.title);
  const [dragging, setDragging] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = `chat-menu-${chat.id}`;

  useEffect(() => {
    if (menu === 'closed') return;
    menuRef.current
      ?.querySelector<HTMLElement>('[role="menuitem"], [role="menuitemradio"]')
      ?.focus();
    const outside = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node) && event.target !== trigger.current)
        setMenu('closed');
    };
    document.addEventListener('mousedown', outside);
    return () => {
      document.removeEventListener('mousedown', outside);
    };
  }, [menu]);

  function close(focusTrigger = true) {
    setMenu('closed');
    if (focusTrigger) trigger.current?.focus();
  }
  function onMenuKey(event: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"]') ??
        [],
    );
    const index = items.findIndex((element) => element === document.activeElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      items.at((index + step + items.length) % items.length)?.focus();
    } else if (event.key === 'Tab') {
      close(false);
    }
  }
  async function saveTitle() {
    setEditing(false);
    const next = title.trim();
    if (next && next !== chat.title) await onRename(next);
    else setTitle(chat.title);
  }

  if (editing)
    return (
      <li className="px-0.5">
        <label htmlFor={`rename-${chat.id}`} className="sr-only">
          {SIDEBAR_COPY.chatName}
        </label>
        <input
          id={`rename-${chat.id}`}
          autoFocus
          maxLength={120}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
          }}
          onBlur={() => void saveTitle()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void saveTitle();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              setTitle(chat.title);
              setEditing(false);
            }
          }}
          className="min-h-10 w-full rounded-md border border-[var(--accent)] bg-[var(--surface)] px-2.5 text-sm"
        />
        <p className="px-2.5 pt-1 text-xs text-[var(--ink-3)]">{SIDEBAR_COPY.renameHint}</p>
      </li>
    );

  return (
    <li className={`group relative flex items-center ${dragging ? 'opacity-40' : ''}`}>
      <Link
        href={`/c/${chat.id}`}
        // D-153: drag a chat onto a project (or onto Chats) to move it; the menu does the same.
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData(CHAT_DRAG_TYPE, chat.id);
          event.dataTransfer.effectAllowed = 'move';
          setDragging(true);
        }}
        onDragEnd={() => {
          setDragging(false);
        }}
        {...(onNavigate ? { onClick: onNavigate } : {})}
        aria-current={active ? 'page' : undefined}
        className={`flex min-h-10 min-w-0 flex-1 items-center rounded-lg pr-10 pl-2.5 text-sm hover:bg-[var(--rule)] hover:no-underline ${active ? 'bg-[var(--rule)] font-medium text-[var(--ink)]' : 'text-[var(--ink-2)]'}`}
      >
        <span className="truncate">{chat.title}</span>
      </Link>
      <button
        ref={trigger}
        type="button"
        aria-label={`${SIDEBAR_COPY.options} ${chat.title}`}
        aria-haspopup="menu"
        aria-expanded={menu !== 'closed'}
        aria-controls={menu === 'closed' ? undefined : menuId}
        onClick={() => {
          setMenu((value) => (value === 'closed' ? 'main' : 'closed'));
        }}
        className={`absolute right-1 flex size-8 items-center justify-center rounded-md text-[var(--ink-3)] hover:bg-[var(--rule-strong)] hover:text-[var(--ink)] focus-visible:opacity-100 ${menu === 'closed' ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'} max-md:opacity-100`}
      >
        <MoreHorizontal size={16} aria-hidden="true" />
      </button>
      {menu !== 'closed' && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={menu === 'move' ? SIDEBAR_COPY.moveTo : SIDEBAR_COPY.options}
          onKeyDown={onMenuKey}
          className="absolute top-full right-0 z-20 mt-1 w-56 rounded-[var(--radius)] border border-[var(--rule-strong)] bg-[var(--surface)] p-1.5 text-[var(--ink)] shadow-lg"
        >
          {menu === 'main' ? (
            <>
              <button
                role="menuitem"
                className={item}
                onClick={() => {
                  setMenu('closed');
                  setEditing(true);
                }}
              >
                <Pencil size={15} aria-hidden="true" />
                {SIDEBAR_COPY.rename}
              </button>
              <button
                role="menuitem"
                aria-haspopup="menu"
                className={item}
                onClick={() => {
                  setMenu('move');
                }}
              >
                <Folder size={15} aria-hidden="true" />
                {SIDEBAR_COPY.moveTo}
              </button>
              <button
                role="menuitem"
                className={item}
                onClick={() => {
                  close();
                  void onPin(!chat.pinned);
                }}
              >
                {chat.pinned ? (
                  <PinOff size={15} aria-hidden="true" />
                ) : (
                  <Pin size={15} aria-hidden="true" />
                )}
                {chat.pinned ? SIDEBAR_COPY.unpin : SIDEBAR_COPY.pin}
              </button>
              <div className="my-1 h-px bg-[var(--rule)]" role="separator" />
              <button
                role="menuitem"
                className={`${item} text-[var(--danger)]`}
                onClick={() => {
                  close(false);
                  onDelete();
                }}
              >
                <Trash2 size={15} aria-hidden="true" />
                {SIDEBAR_COPY.delete}
              </button>
            </>
          ) : (
            <>
              <button
                role="menuitem"
                className={`${item} text-[var(--ink-3)]`}
                onClick={() => {
                  setMenu('main');
                }}
              >
                <ChevronLeft size={15} aria-hidden="true" />
                {SIDEBAR_COPY.back}
              </button>
              {[{ id: null, name: SIDEBAR_COPY.noProject }, ...projects].map((project) => (
                <button
                  key={project.id ?? 'none'}
                  role="menuitemradio"
                  aria-checked={chat.projectId === project.id}
                  className={item}
                  onClick={() => {
                    close();
                    if (chat.projectId !== project.id) void onMove(project.id);
                  }}
                >
                  <span className="flex size-4 items-center justify-center">
                    {chat.projectId === project.id && <Check size={15} aria-hidden="true" />}
                  </span>
                  <span className="truncate">{project.name}</span>
                </button>
              ))}
              {projects.length === 0 && (
                <p className="px-2.5 py-2 text-xs text-[var(--ink-3)]">{SIDEBAR_COPY.noProjects}</p>
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
}
