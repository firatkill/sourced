import 'server-only';
import { AskApp, type SavedChats } from '@/components/ask/AskApp';
import { ConfigurationError } from '@/components/layout/ConfigurationError';
import { listChats, listProjects } from '@/lib/chats/store';
import { readAppConfiguration } from '@/lib/kit/app-configuration';
import { uiCopy } from '@/lib/kit/copy';
import { getPageCopy } from '@/lib/kit/copy-server';
import { isPublicDemo } from '@/lib/kit/profile';
import { getKitConfig, sourcedCommand } from '@/lib/kit/runtime-config';
import { getLibraryFacts } from '@/lib/library/facts';
import { libraryPill, searchingLine } from '@/lib/library/format';
import type { SavedTurn } from '@/lib/chats/store';
import type { SidebarData } from '@/components/sidebar/ChatSidebar';

/** REDESIGN-v2 §3: facts replace the corpus title outside the hosted demo. */
async function readLibrary() {
  if (isPublicDemo()) return undefined;
  try {
    const facts = await getLibraryFacts();
    return { pill: libraryPill(facts, new Date()), searching: searchingLine(facts) };
  } catch {
    return undefined; // The page still works without facts; /api/health reports the database.
  }
}

/** D-142: the sidebar's first render comes from the server, so it never flashes empty. */
export async function readSidebar(): Promise<SidebarData> {
  try {
    const [chats, projects] = await Promise.all([listChats(), listProjects()]);
    return { chats, projects, now: new Date().toISOString() };
  } catch {
    return { chats: [], projects: [], now: new Date().toISOString() };
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
  const library = await readLibrary();
  const command = sourcedCommand();
  const example =
    getKitConfig().profile === 'local' && copy.exampleNotice && !chat
      ? { notice: copy.exampleNotice, commands: [`${command} reset`, `${command} add ./my-docs`] }
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
      library={library}
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
