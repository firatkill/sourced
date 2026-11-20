'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { SiteHeader } from './SiteHeader';

export function PageShell({ children, footer }: { children: ReactNode; footer: ReactNode }) {
  const pathname = usePathname();
  // The ask page, saved chats and projects bring their own shell with the sidebar (T-83).
  // T-86: content pages render their own ContentShell too; only not-found keeps the top bar.
  // T-90: /setup has its own header and stepper.
  const ownShell = ['/', '/eval', '/how-it-works', '/settings/appearance', '/setup'].includes(
    pathname,
  );
  if (ownShell || pathname.startsWith('/c/') || pathname.startsWith('/p/')) return children;
  return (
    <>
      <SiteHeader />
      <main id="content" className="shell" tabIndex={-1}>
        {children}
      </main>
      {footer}
    </>
  );
}
