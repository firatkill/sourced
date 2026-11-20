import type { Metadata } from 'next';
import { z } from 'zod';
import { AskPage } from '@/components/ask/AskPage';
import { CONFIGURATION_COPY } from '@/lib/copy';
import { readAppConfiguration } from '@/lib/kit/app-configuration';

export function generateMetadata(): Metadata {
  const configuration = readAppConfiguration();
  return configuration.ok
    ? { title: configuration.copy.documentTitle, description: configuration.copy.lead }
    : { title: CONFIGURATION_COPY.heading };
}

/** `/?project=<id>` starts a new chat inside that project (T-83). */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const project = z.uuid().safeParse((await searchParams).project);
  // Called as a function so the page stays a plain async server render (D-119 diagnostics test).
  return AskPage(project.success ? { projectId: project.data } : {});
}
