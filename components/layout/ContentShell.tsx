'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ChatRail } from '@/components/ask/ChatRail';
import type { SidebarData } from '@/components/sidebar/ChatSidebar';
import type { CorpusCopy } from '@/lib/copy';

/** T-86 / REDESIGN-v2 §7: content pages share the chat sidebar instead of a top bar. */
export function ContentShell({
  copy,
  saved,
  children,
}: {
  copy: CorpusCopy;
  saved?: SidebarData | undefined;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    // The document scrolls (no inner scroll region); the rail stays in view on wide screens.
    <div className="flex min-h-dvh flex-col md:flex-row">
      <ChatRail
        copy={copy}
        turns={[]}
        busy={false}
        onNew={() => {
          router.push('/');
        }}
        saved={saved ? { initial: saved } : undefined}
      />
      <main id="content" tabIndex={-1} className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-[1040px] px-5 py-10 sm:px-8">{children}</div>
      </main>
    </div>
  );
}
