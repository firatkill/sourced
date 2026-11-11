import { getPageCopy } from '@/lib/kit/copy-server';
import type { Metadata } from 'next';
import { AskApp } from '@/components/ask/AskApp';
import { CONFIGURATION_COPY } from '@/lib/copy';
import { ConfigurationError } from '@/components/layout/ConfigurationError';
import { readAppConfiguration } from '@/lib/kit/app-configuration';
import { isPublicDemo } from '@/lib/kit/profile';

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
  return (
    <AskApp
      demoMode={isPublicDemo() ? env.DEMO_MODE : 'on'}
      publicDemo={isPublicDemo()}
      limits={{ ipDaily: env.RATE_LIMIT_IP_DAILY, globalDaily: env.RATE_LIMIT_GLOBAL_DAILY }}
      suggested={copy.suggested}
      copy={copy}
    />
  );
}
