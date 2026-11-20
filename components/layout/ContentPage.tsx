import 'server-only';
import type { ReactNode } from 'react';
import { readSidebar } from '@/components/ask/AskPage';
import { ContentShell } from '@/components/layout/ContentShell';
import { uiCopy } from '@/lib/kit/copy';
import { getRuntimeCopy } from '@/lib/kit/copy-server';
import { isPublicDemo } from '@/lib/kit/profile';

/** T-86: a content page inside the app shell; saved chats appear outside the hosted demo. */
export async function ContentPage({ children }: { children: ReactNode }) {
  const saved = isPublicDemo() ? undefined : await readSidebar();
  return (
    <ContentShell copy={uiCopy(getRuntimeCopy())} saved={saved}>
      {children}
    </ContentShell>
  );
}
