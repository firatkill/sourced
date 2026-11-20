import 'server-only';
import { redirect } from 'next/navigation';
import { AskApp, type SavedChats } from '@/components/ask/AskApp';
import { ConfigurationError } from '@/components/layout/ConfigurationError';
import { getProject, listChats, listProjects } from '@/lib/chats/store';
import { readAppConfiguration } from '@/lib/kit/app-configuration';
import { uiCopy } from '@/lib/kit/copy';
import { getPageCopy } from '@/lib/kit/copy-server';
import { isPublicDemo } from '@/lib/kit/profile';
import { getKitConfig } from '@/lib/kit/runtime-config';
import { getLibraryFacts, listLibrarySources } from '@/lib/library/facts';
import {
  libraryPill,
  scopeLabels,
  scopedSearchingLine,
  searchingLine,
} from '@/lib/library/format';
import type { SavedTurn } from '@/lib/chats/store';
import type { SidebarData } from '@/components/sidebar/ChatSidebar';

/** REDESIGN-v2 §3: facts replace the corpus title outside the hosted demo. */
async function readLibrary() {
  if (isPublicDemo()) return undefined;
  try {
    const facts = await getLibraryFacts();
    return {
      pill: libraryPill(facts, new Date()),
      searching: searchingLine(facts),
      documents: facts.documents,
    };
  } catch {
    return undefined; // The page still works without facts; /api/health reports the database.
  }
}

/** D-150: in a project limited to some sources, the line under the composer names only those. */
async function readScopeLine(projectId: string | null | undefined): Promise<string | null> {
  if (!projectId || isPublicDemo()) return null;
  try {
    const { sourceIds } = await getProject(projectId);
    if (sourceIds === null) return null;
    return scopedSearchingLine(
      scopeLabels(sourceIds, await listLibrarySources()).map((entry) => entry.label),
    );
  } catch {
    return null;
  }
}

/** D-142: the sidebar's first render comes from the server, so it never flashes empty. */
export async function readSidebar(): Promise<SidebarData> {
  const settings = getKitConfig().profile === 'local';
  try {
    const [chats, projects] = await Promise.all([listChats(), listProjects()]);
    return { chats, projects, now: new Date().toISOString(), settings };
  } catch {
    return { chats: [], projects: [], now: new Date().toISOString(), settings };
  }
}

/** The ask page shared by `/` and `/c/[chatId]`. */
export async function AskPage({
  chat,
  projectId,
}: {
  chat?: { id: string; projectId: string | null; title: string; turns: SavedTurn[] };
  projectId?: string;
}) {
  const configuration = readAppConfiguration();
  if (!configuration.ok) return <ConfigurationError fixes={configuration.fixes} />;
  const copy = await getPageCopy();
  const { env } = configuration;
  const publicDemo = isPublicDemo();
  const [library, scopeLine] = await Promise.all([
    readLibrary(),
    readScopeLine(chat ? chat.projectId : projectId),
  ]);
  // T-90 / R2 §6: the local app sends a new chat to /setup until something is indexed.
  if (!chat && getKitConfig().profile === 'local' && library?.documents === 0) redirect('/setup');
  const example =
    getKitConfig().profile === 'local' && copy.exampleNotice && !chat
      ? { notice: copy.exampleNotice }
      : undefined;
  const saved: SavedChats | undefined = publicDemo
    ? undefined
    : {
        initial: await readSidebar(),
        ...(chat ? { chat } : {}),
        ...(projectId ? { projectId } : {}),
      };
  return (
    <AskApp
      library={
        library
          ? {
              pill: library.pill,
              searching: library.searching,
              ...(scopeLine ? { scoped: scopeLine } : {}),
            }
          : undefined
      }
      example={example}
      saved={saved}
      demoMode={publicDemo ? env.DEMO_MODE : 'on'}
      publicDemo={publicDemo}
      limits={{ ipDaily: env.RATE_LIMIT_IP_DAILY, globalDaily: env.RATE_LIMIT_GLOBAL_DAILY }}
      suggested={copy.suggested}
      copy={uiCopy(copy)}
    />
  );
}
