'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

/**
 * A popover menu's open state with the keys ChatRow's menu uses: the first item takes focus,
 * arrows move, Escape closes back to the trigger, Tab and a click outside close it.
 */
export function useMenu() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const outside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target))
        setOpen(false);
    };
    document.addEventListener('mousedown', outside);
    return () => {
      document.removeEventListener('mousedown', outside);
    };
  }, [open]);
  function close(focusTrigger = true) {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
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
  return { open, setOpen, close, triggerRef, menuRef, onKeyDown };
}

/** The drag payload of a chat row (D-153: drop a chat on a project to move it). */
export const CHAT_DRAG_TYPE = 'application/x-sourced-chat';
