import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { ConfigurationError } from '@/components/layout/ConfigurationError';
import { ProjectView } from '@/components/projects/ProjectView';
import { SessionProjectView } from '@/components/projects/SessionProjectView';
import { readSidebar } from '@/components/ask/AskPage';
import { NotFoundError, getProject, listChats } from '@/lib/chats/store';
import { readAppConfiguration } from '@/lib/kit/app-configuration';
import { uiCopy } from '@/lib/kit/copy';
import { isPublicDemo } from '@/lib/kit/profile';
import { listLibrarySources } from '@/lib/library/facts';

type Props = { params: Promise<{ projectId: string }> };

async function load(id: string) {
  try {
    return await getProject(id);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof z.ZodError) notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (isPublicDemo()) return { title: 'Project · Sourced' };
  const project = await load((await params).projectId);
  return { title: `${project.name} · Sourced` };
}

/** T-83 / D-142: a project and its chats. */
export default async function ProjectPage({ params }: Props) {
  const configuration = readAppConfiguration();
  if (!configuration.ok) return <ConfigurationError fixes={configuration.fixes} />;
  const { projectId } = await params;
  // D-154: the hosted demo keeps projects in the visitor's tab, so the browser loads this one.
  if (isPublicDemo()) {
    if (!z.uuid().safeParse(projectId).success) notFound();
    return (
      <SessionProjectView
        copy={uiCopy(configuration.copy)}
        initial={await readSidebar()}
        projectId={projectId}
      />
    );
  }
  const project = await load(projectId);
  const [initial, chats, sources] = await Promise.all([
    readSidebar(),
    listChats({ projectId: project.id }),
    listLibrarySources(),
  ]);
  return (
    <ProjectView
      copy={uiCopy(configuration.copy)}
      initial={initial}
      project={project}
      chats={chats}
      sources={sources}
      now={initial.now}
    />
  );
}
