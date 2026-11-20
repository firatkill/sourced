import { getPageCopy } from '@/lib/kit/copy-server';
import { uiCopy } from '@/lib/kit/copy';
import type { Metadata } from 'next';
import { AskApp } from '@/components/ask/AskApp';
import { CONFIGURATION_COPY } from '@/lib/copy';
import { ConfigurationError } from '@/components/layout/ConfigurationError';
import { readAppConfiguration } from '@/lib/kit/app-configuration';
import { isPublicDemo } from '@/lib/kit/profile';
import { getKitConfig, sourcedCommand } from '@/lib/kit/runtime-config';
import { getLibraryFacts } from '@/lib/library/facts';
import { libraryPill, searchingLine } from '@/lib/library/format';

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

export function generateMetadata(): Metadata {
  const configuration = readAppConfiguration();
  return configuration.ok
    ? { title: configuration.copy.documentTitle, description: configuration.copy.lead }
    : { title: CONFIGURATION_COPY.heading };
}

export default async function Home() {
  const configuration = readAppConfiguration();
  if (!configuration.ok) return <ConfigurationError fixes={configuration.fixes} />;
  const copy = await getPageCopy();
  const { env } = configuration;
  const library = await readLibrary();
  const command = sourcedCommand();
  const example =
    getKitConfig().profile === 'local' && copy.exampleNotice
      ? { notice: copy.exampleNotice, commands: [`${command} reset`, `${command} add ./my-docs`] }
      : undefined;
  return (
    <AskApp
      library={library}
      example={example}
      demoMode={isPublicDemo() ? env.DEMO_MODE : 'on'}
      publicDemo={isPublicDemo()}
      limits={{ ipDaily: env.RATE_LIMIT_IP_DAILY, globalDaily: env.RATE_LIMIT_GLOBAL_DAILY }}
      suggested={copy.suggested}
      copy={uiCopy(copy)}
    />
  );
}
