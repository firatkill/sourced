'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { ASK_COPY } from '@/lib/copy';
import { ChatIcon } from './ChatIcon';
import { Modal } from './Modal';

type Props = { turns: { id: number; question: string }[]; busy: boolean; onNew: () => void };
export function ChatRail({ turns, busy, onNew }: Props) {
  const [selection, setSelection] = useState<{ id: number; count: number } | null>(null);
  const currentId = selection?.count === turns.length ? selection.id : turns.at(-1)?.id;
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const media = matchMedia('(min-width: 768px)');
    const resize = () => {
      if (media.matches) setOpen(false);
    };
    media.addEventListener('change', resize);
    return () => {
      media.removeEventListener('change', resize);
    };
  }, []);
  const content = (
    <div className="flex min-h-full flex-col">
      <nav aria-label="Main" className="flex flex-1 flex-col gap-6 p-4 text-sm">
        <Link href="/" className="flex min-h-11 items-center gap-3 font-bold">
          <span
            aria-hidden="true"
            className="flex size-7 items-center justify-center rounded-lg bg-[var(--ink)] text-[var(--surface)]"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M4 6h10M4 12h16M4 18h7" />
              <circle cx="18" cy="6" r="2" />
            </svg>
          </span>
          <span>
            Sourced
            <span className="block text-xs font-normal text-[var(--ink-3)]">
              {ASK_COPY.railSubtitle}
            </span>
          </span>
        </Link>
        <button
          className="flex min-h-11 items-center gap-2.5 rounded-md border border-[var(--rule-strong)] bg-[var(--surface)] px-3 text-left font-medium"
          disabled={busy}
          onClick={() => {
            setOpen(false);
            onNew();
          }}
        >
          <ChatIcon name="newChat" />
          New chat
        </button>
        <section className="space-y-3" aria-label="This session">
          <h2 className="text-xs! font-semibold tracking-[0.04em] text-[var(--ink-3)] uppercase">
            This session
          </h2>
          {turns.length === 0 ? (
            <p className="text-[var(--ink-3)]">Your questions will appear here.</p>
          ) : (
            <ol className="space-y-1">
              {turns.map((turn) => (
                <li key={turn.id}>
                  <button
                    className={`min-h-11 w-full truncate rounded-lg px-2.5 py-[9px] text-left text-sm ${currentId === turn.id ? 'bg-[var(--rule)]' : 'hover:bg-[var(--surface)]'}`}
                    onClick={() => {
                      setSelection({ id: turn.id, count: turns.length });
                      setOpen(false);
                      // Let the modal restore its opener before moving focus to the chosen turn.
                      requestAnimationFrame(() => {
                        const target = document.getElementById(`turn-${String(turn.id)}`);
                        target?.focus({ preventScroll: true });
                        target?.scrollIntoView({
                          block: 'start',
                          behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
                            ? 'instant'
                            : 'smooth',
                        });
                      });
                    }}
                  >
                    {turn.question}
                  </button>
                </li>
              ))}
            </ol>
          )}
          <p className="text-xs text-[var(--ink-3)]">{ASK_COPY.sessionPrivacy}</p>
        </section>
        <div className="mt-auto flex flex-col gap-2 border-t border-[var(--rule)] pt-4">
          <a
            className="flex min-h-11 items-center gap-2.5 rounded-lg px-2.5 py-[9px] text-sm text-[var(--ink-2)] hover:bg-[var(--rule)] hover:no-underline"
            href="/eval"
          >
            <ChatIcon name="chart" />
            Evaluation
          </a>
          <a
            className="flex min-h-11 items-center gap-2.5 rounded-lg px-2.5 py-[9px] text-sm text-[var(--ink-2)] hover:bg-[var(--rule)] hover:no-underline"
            href="/how-it-works"
          >
            <ChatIcon name="info" />
            How it works
          </a>
          <a
            className="flex min-h-11 items-center gap-2.5 rounded-lg px-2.5 py-[9px] text-sm text-[var(--ink-2)] hover:bg-[var(--rule)] hover:no-underline"
            href="https://github.com/firatkill/sourced"
          >
            <ChatIcon name="github" />
            Source on GitHub
          </a>
          <ThemeToggle label />
        </div>
      </nav>
      <footer className="space-y-3 p-4 text-xs text-[var(--ink-3)]">
        <p>
          Built by Fırat Kıl · <a href="https://firatkil.com">firatkil.com</a> ·{' '}
          <a href="https://github.com/firatkill/sourced">Source on GitHub (MIT)</a>
        </p>
        <p>
          {ASK_COPY.attribution}{' '}
          <a href="https://www.postgresql.org/about/licence/">PostgreSQL License</a>.
        </p>
        <p>
          Privacy: questions are not stored.{' '}
          <a href="/how-it-works#privacy">Read how this works.</a>
        </p>
      </footer>
    </div>
  );
  return (
    <>
      <div className="hidden h-dvh w-[264px] shrink-0 overflow-y-auto border-r border-[var(--rule)] bg-[var(--rail)] md:block">
        {content}
      </div>
      <header className="flex h-[60px] shrink-0 items-center justify-between border-b border-[var(--rule)] px-4 md:hidden">
        <button
          className="flex size-11 items-center justify-center"
          aria-label="Menu"
          onClick={() => {
            setOpen(true);
          }}
          aria-haspopup="dialog"
        >
          <ChatIcon name="menu" size={20} />
        </button>
        <span className="font-bold">Sourced</span>
        <button
          type="button"
          aria-label="New chat"
          disabled={busy}
          onClick={onNew}
          className="flex size-11 items-center justify-center disabled:opacity-50"
        >
          <ChatIcon name="newChat" size={20} />
        </button>
      </header>
      {open && (
        <Modal
          label="Main menu"
          onClose={() => {
            setOpen(false);
          }}
          className="fixed inset-y-0 left-0 m-0 h-dvh max-h-none w-[min(320px,100vw)] max-w-none overflow-y-auto border-r border-[var(--rule)] bg-[var(--rail)] text-[var(--ink)]"
        >
          <button
            className="m-4 min-h-11 px-3"
            onClick={() => {
              setOpen(false);
            }}
          >
            Close menu
          </button>
          {content}
        </Modal>
      )}
    </>
  );
}
