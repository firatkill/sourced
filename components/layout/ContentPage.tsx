import 'server-only';
import type { ReactNode } from 'react';
import { readSidebar } from '@/components/ask/AskPage';
import { ContentShell } from '@/components/layout/ContentShell';
import { uiCopy } from '@/lib/kit/copy';
import { getRuntimeCopy } from '@/lib/kit/copy-server';

/** T-86: a content page inside the app shell; with the saved-chats sidebar. */
export async function ContentPage({ children }: { children: ReactNode }) {
  // D-154: the hosted demo shows the same sidebar; its chats come from the visitor's tab.
  const saved = await readSidebar();
  return (
    <ContentShell copy={uiCopy(getRuntimeCopy())} saved={saved}>
      {children}
    </ContentShell>
  );
}
