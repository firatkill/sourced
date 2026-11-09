'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { SiteHeader } from './SiteHeader';

export function PageShell({ children, footer }: { children: ReactNode; footer: ReactNode }) {
  if (usePathname() === '/') return children;
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
