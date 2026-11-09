import type { Metadata } from 'next';
import { EvalView } from '@/components/eval/EvalView';
import { EVAL_COPY } from '@/components/eval/copy';
import { loadResults } from '@/lib/eval/load-results';

export const metadata: Metadata = { title: EVAL_COPY.title, description: EVAL_COPY.lead };
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function Evaluation() {
  return <EvalView runs={await loadResults()} />;
}
