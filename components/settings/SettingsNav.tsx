'use client';

// T-91 / R2 Settings: the sections. The hosted demo and the private profile only have
// Appearance, so the nav shows there only in the local profile.
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const SECTIONS = [
  { href: '/settings', label: 'Models and keys' },
  { href: '/settings/library', label: 'Library' },
  { href: '/settings/appearance', label: 'Appearance' },
  { href: '/settings/data', label: 'Chats and data' },
] as const;

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings sections" className="mb-8 border-b border-[var(--rule)]">
      <ul className="-mb-px flex flex-wrap gap-1">
        {SECTIONS.map(({ href, label }) => {
          const current = pathname === href;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={current ? 'page' : undefined}
                className={`inline-flex min-h-11 items-center border-b-2 px-3 text-sm hover:no-underline ${current ? 'border-[var(--accent)] font-semibold text-[var(--ink)]' : 'border-transparent text-[var(--ink-2)] hover:text-[var(--ink)]'}`}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
