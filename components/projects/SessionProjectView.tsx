'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSyncExternalStore } from 'react';
import { ChatRail } from '@/components/ask/ChatRail';
import type { SidebarData } from '@/components/sidebar/ChatSidebar';
import { CHATS_CHANGED } from '@/lib/chats/client';
import { getSessionProject, listSessionChats, readRaw } from '@/lib/chats/session-store';
import { PROJECT_COPY, type CorpusCopy } from '@/lib/copy';
import { ProjectView } from './ProjectView';

const SERVER_RENDER = '\u0000server';
function subscribe(listener: () => void) {
  window.addEventListener(CHATS_CHANGED, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(CHATS_CHANGED, listener);
    window.removeEventListener('storage', listener);
  };
}

/** D-154: a hosted-demo project page, read from this browser tab. */
export function SessionProjectView({
  copy,
  initial,
  projectId,
}: {
  copy: CorpusCopy;
  initial: SidebarData;
  projectId: string;
}) {
  const router = useRouter();
  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw() ?? '',
    () => SERVER_RENDER,
  );
  const loading = raw === SERVER_RENDER;
  const project = loading ? null : getSessionProject(projectId);
  if (project)
    return (
      <ProjectView
        // Remount when the tab's copy changes, so the page shows the saved name and chats.
        key={raw}
        copy={copy}
        initial={initial}
        project={project}
        chats={listSessionChats({ projectId })}
        sources={[]}
        now={new Date().toISOString()}
      />
    );
  return (
    <div className="chat-shell flex h-dvh flex-col md:flex-row">
      <ChatRail
        copy={copy}
        turns={[]}
        busy={false}
        onNew={() => {
          router.push('/');
        }}
        saved={{ initial }}
      />
      <main id="content" tabIndex={-1} className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        {!loading && (
          <div className="mx-auto w-full max-w-[840px] px-5 py-12 sm:px-8">
            <h1>{PROJECT_COPY.missing}</h1>
            <p className="mt-2 text-[var(--ink-2)]">{PROJECT_COPY.missingBody}</p>
            <Link href="/" className="mt-4 inline-flex min-h-11 items-center text-[var(--accent)]">
              {PROJECT_COPY.missingLink}
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
