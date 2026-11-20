'use client';

import { useState, type DragEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronDown,
  ChevronRight,
  MessageSquarePlus,
  MoreHorizontal,
  Pencil,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import type { ProjectItem } from '@/lib/chats/client';
import { SIDEBAR_COPY } from '@/lib/copy';
import { CHAT_DRAG_TYPE, useMenu } from './useMenu';

const item =
  'flex min-h-10 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm hover:bg-[var(--rule)] focus-visible:bg-[var(--rule)]';

/** A chat being dragged over a target: the target accepts it and lights up (D-153). */
export function useChatDrop(onDrop: (chatId: string) => void) {
  const [over, setOver] = useState(false);
  const accepts = (event: DragEvent) => event.dataTransfer.types.includes(CHAT_DRAG_TYPE);
  return {
    over,
    handlers: {
      onDragOver: (event: DragEvent) => {
        if (!accepts(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setOver(true);
      },
      onDragLeave: (event: DragEvent) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
      },
      onDrop: (event: DragEvent) => {
        if (!accepts(event)) return;
        event.preventDefault();
        setOver(false);
        const id = event.dataTransfer.getData(CHAT_DRAG_TYPE);
        if (id) onDrop(id);
      },
    },
  };
}

/**
 * D-153: a project is a folder among the chats, like a group in a chat app's sidebar. The
 * header opens and closes it; its ⋯ menu starts a chat in it or opens its settings.
 */
export function ProjectGroup({
  project,
  open,
  active,
  onToggle,
  onNavigate,
  onDropChat,
  onRename,
  onDelete,
  children,
}: {
  project: ProjectItem;
  open: boolean;
  active: boolean;
  onToggle: () => void;
  onNavigate?: (() => void) | undefined;
  onDropChat: (chatId: string) => void;
  onRename: (name: string) => Promise<void>;
  onDelete: () => void;
  children: ReactNode;
}) {
  const router = useRouter();
  const {
    open: menuOpen,
    setOpen: setMenuOpen,
    close: closeMenu,
    triggerRef,
    menuRef,
    onKeyDown,
  } = useMenu();
  const drop = useChatDrop(onDropChat);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(project.name);
  const menuId = `project-menu-${project.id}`;
  const go = (href: string) => {
    closeMenu(false);
    onNavigate?.();
    router.push(href);
  };
  async function saveName() {
    setEditing(false);
    const next = name.trim();
    if (next && next !== project.name) await onRename(next);
    else setName(project.name);
  }

  return (
    <li
      {...drop.handlers}
      data-drop-target={drop.over ? 'over' : undefined}
      className={`rounded-lg ${drop.over ? 'bg-[var(--accent-soft)] outline-2 outline-[var(--accent)]' : ''}`}
    >
      {editing ? (
        <div className="px-0.5">
          <label htmlFor={`rename-project-${project.id}`} className="sr-only">
            {SIDEBAR_COPY.projectName}
          </label>
          <input
            id={`rename-project-${project.id}`}
            autoFocus
            maxLength={80}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
            onBlur={() => void saveName()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void saveName();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                setName(project.name);
                setEditing(false);
              }
            }}
            className="min-h-10 w-full rounded-md border border-[var(--accent)] bg-[var(--surface)] px-2.5 text-sm"
          />
        </div>
      ) : (
        <div
          className={`group relative flex items-center rounded-lg ${active ? 'bg-[var(--rule)]' : 'hover:bg-[var(--rule)]'}`}
        >
          <button
            type="button"
            aria-expanded={open}
            onClick={onToggle}
            className={`flex min-h-10 min-w-0 flex-1 items-center gap-1.5 pr-10 pl-2.5 text-left text-[13px] font-medium ${active || drop.over ? 'text-[var(--ink)]' : 'text-[var(--ink-3)]'}`}
          >
            <span className="truncate">{project.name}</span>
            {open ? (
              <ChevronDown size={14} aria-hidden="true" className="shrink-0" />
            ) : (
              <ChevronRight size={14} aria-hidden="true" className="shrink-0" />
            )}
          </button>
          <button
            ref={triggerRef}
            type="button"
            aria-label={`${SIDEBAR_COPY.options} ${project.name}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls={menuOpen ? menuId : undefined}
            onClick={() => {
              setMenuOpen((value) => !value);
            }}
            className={`absolute right-1 flex size-8 items-center justify-center rounded-md text-[var(--ink-3)] hover:bg-[var(--rule-strong)] hover:text-[var(--ink)] focus-visible:opacity-100 ${menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} max-md:opacity-100`}
          >
            <MoreHorizontal size={16} aria-hidden="true" />
          </button>
          {menuOpen && (
            <div
              ref={menuRef}
              id={menuId}
              role="menu"
              aria-label={project.name}
              onKeyDown={onKeyDown}
              className="absolute top-full right-0 z-20 mt-1 w-56 rounded-[var(--radius)] border border-[var(--rule-strong)] bg-[var(--surface)] p-1.5 text-[var(--ink)] shadow-lg"
            >
              <button
                role="menuitem"
                className={item}
                onClick={() => {
                  go(`/?project=${project.id}`);
                }}
              >
                <MessageSquarePlus size={15} aria-hidden="true" />
                {SIDEBAR_COPY.newChatInProject}
              </button>
              <button
                role="menuitem"
                className={item}
                onClick={() => {
                  go(`/p/${project.id}`);
                }}
              >
                <SlidersHorizontal size={15} aria-hidden="true" />
                {SIDEBAR_COPY.projectSettings}
              </button>
              <button
                role="menuitem"
                className={item}
                onClick={() => {
                  closeMenu(false);
                  setEditing(true);
                }}
              >
                <Pencil size={15} aria-hidden="true" />
                {SIDEBAR_COPY.rename}
              </button>
              <div className="my-1 h-px bg-[var(--rule)]" role="separator" />
              <button
                role="menuitem"
                className={`${item} text-[var(--danger)]`}
                onClick={() => {
                  closeMenu(false);
                  onDelete();
                }}
              >
                <Trash2 size={15} aria-hidden="true" />
                {SIDEBAR_COPY.deleteProject}
              </button>
            </div>
          )}
        </div>
      )}
      {drop.over && !open && (
        <p className="px-2.5 pb-2 text-xs text-[var(--accent-soft-ink)]">{SIDEBAR_COPY.dropHere}</p>
      )}
      {open && children}
    </li>
  );
}
