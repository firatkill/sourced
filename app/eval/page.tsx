import { readAppConfiguration } from '@/lib/kit/app-configuration';
import { ConfigurationError } from '@/components/layout/ConfigurationError';
import type { Metadata } from 'next';
import { EvalView } from '@/components/eval/EvalView';
import { EVAL_COPY } from '@/components/eval/copy';
import { getKitConfig, sourcedCommand } from '@/lib/kit/runtime-config';
import { loadResults } from '@/lib/eval/load-results';
import { ContentPage } from '@/components/layout/ContentPage';

export const metadata: Metadata = {
  title: EVAL_COPY.title,
  description:
    'Every change to retrieval or prompts is measured against hand-written questions. These are the committed results of the latest run; nothing on this page is computed live.',
};
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function Evaluation() {
  const configuration = readAppConfiguration();
  if (!configuration.ok) return <ConfigurationError fixes={configuration.fixes} />;
  return (
    <ContentPage>
      <EvalView
        runs={await loadResults()}
        // The committed location (also the GitHub link), not a test override.
        resultsDirectory={`eval/${getKitConfig().corpus.name}/results`}
        command={sourcedCommand()}
      />
    </ContentPage>
  );
}
