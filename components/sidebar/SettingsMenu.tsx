'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Library, RotateCcw, Settings } from 'lucide-react';
import { RESET_COPY, SIDEBAR_COPY } from '@/lib/copy';
import { ResetDataDialog } from './ResetDataDialog';
import { useMenu } from './useMenu';

const item =
  'flex min-h-10 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm hover:bg-[var(--rule)] focus-visible:bg-[var(--rule)]';

/** D-153: the local app's Settings button opens Library, Settings and Reset all data. */
export function SettingsMenu({ current }: { current: boolean }) {
  const router = useRouter();
  const {
    open: menuOpen,
    setOpen: setMenuOpen,
    close: closeMenu,
    triggerRef,
    menuRef,
    onKeyDown,
  } = useMenu();
  const [resetting, setResetting] = useState(false);
  const go = (href: string) => {
    closeMenu(false);
    router.push(href);
  };
  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? 'settings-menu' : undefined}
        onClick={() => {
          setMenuOpen((value) => !value);
        }}
        className={`flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm hover:bg-[var(--rule)] ${current || menuOpen ? 'bg-[var(--rule)] text-[var(--ink)]' : 'text-[var(--ink-2)]'}`}
      >
        <Settings size={16} aria-hidden="true" />
        {SIDEBAR_COPY.settingsMenu}
      </button>
      {menuOpen && (
        <div
          ref={menuRef}
          id="settings-menu"
          role="menu"
          aria-label={SIDEBAR_COPY.settingsMenu}
          onKeyDown={onKeyDown}
          className="absolute right-0 bottom-full left-0 z-20 mb-1 rounded-[var(--radius)] border border-[var(--rule-strong)] bg-[var(--surface)] p-1.5 text-[var(--ink)] shadow-lg"
        >
          <button
            role="menuitem"
            className={item}
            onClick={() => {
              go('/settings/library');
            }}
          >
            <Library size={15} aria-hidden="true" />
            {SIDEBAR_COPY.library}
          </button>
          <button
            role="menuitem"
            className={item}
            onClick={() => {
              go('/settings');
            }}
          >
            <Settings size={15} aria-hidden="true" />
            {SIDEBAR_COPY.settingsMenu}
          </button>
          <div className="my-1 h-px bg-[var(--rule)]" role="separator" />
          <button
            role="menuitem"
            className={`${item} text-[var(--danger)]`}
            onClick={() => {
              closeMenu(false);
              setResetting(true);
            }}
          >
            <RotateCcw size={15} aria-hidden="true" />
            {RESET_COPY.menuItem}
          </button>
        </div>
      )}
      {resetting && (
        <ResetDataDialog
          onClose={() => {
            setResetting(false);
          }}
        />
      )}
    </div>
  );
}
