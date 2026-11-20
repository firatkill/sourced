import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { ConfigurationError } from '@/components/layout/ConfigurationError';
import { ProjectView } from '@/components/projects/ProjectView';
import { readSidebar } from '@/components/ask/AskPage';
import { NotFoundError, getProject, listChats } from '@/lib/chats/store';
import { readAppConfiguration } from '@/lib/kit/app-configuration';
import { uiCopy } from '@/lib/kit/copy';
import { isPublicDemo } from '@/lib/kit/profile';
import { listLibrarySources } from '@/lib/library/facts';

type Props = { params: Promise<{ projectId: string }> };

async function load(id: string) {
  if (isPublicDemo()) notFound();
  try {
    return await getProject(id);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof z.ZodError) notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const project = await load((await params).projectId);
  return { title: `${project.name} · Sourced` };
}

/** T-83 / D-142: a project and its chats. */
export default async function ProjectPage({ params }: Props) {
  const configuration = readAppConfiguration();
  if (!configuration.ok) return <ConfigurationError fixes={configuration.fixes} />;
  const project = await load((await params).projectId);
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
