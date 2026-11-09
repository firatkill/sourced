'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { ThemeToggle } from './ThemeToggle';

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="site-header">
      <div className="shell">
        <Link className="flex min-h-11 items-center gap-2.5 font-bold" href="/">
          <span className="flex size-7 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--user-bubble)] text-[var(--user-bubble-ink)]">
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
          Sourced
        </Link>
        <nav aria-label="Main" className="text-sm">
          <Link href="/" aria-current={pathname === '/' ? 'page' : undefined}>
            Ask
          </Link>
          <Link href="/eval" aria-current={pathname === '/eval' ? 'page' : undefined}>
            Evaluation
          </Link>
          <Link
            href="/how-it-works"
            aria-current={pathname === '/how-it-works' ? 'page' : undefined}
          >
            How it works
          </Link>
          <a href="https://github.com/firatkill/sourced">GitHub</a>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
