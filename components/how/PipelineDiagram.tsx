import { RETRIEVAL } from '@/lib/config';

const steps = [
  {
    label: '01 · SEARCH',
    title: 'Two searches, one list',
    body: `Meaning search finds ${String(RETRIEVAL.VECTOR_CANDIDATES)} passages, keyword search finds ${String(RETRIEVAL.FTS_CANDIDATES)}. Reciprocal Rank Fusion merges them and keeps the top ${String(RETRIEVAL.RERANK_CANDIDATES)}.`,
  },
  {
    label: '02 · RERANK',
    title: 'The model picks six',
    body: `The language model orders the ${String(RETRIEVAL.RERANK_CANDIDATES)} by how well they answer your question. If it takes longer than ${String(RETRIEVAL.RERANK_TIMEOUT_MS / 1000)} s, the search order is used.`,
  },
  {
    label: '03 · WRITE',
    title: 'An answer with receipts',
    body: `The answer streams from the top ${String(RETRIEVAL.FINAL_PASSAGES)} passages only. For every claim, the model names its passage and the exact sentence that supports it.`,
  },
  {
    label: '04 · CHECK',
    title: 'Every quote is verified',
    body: 'The server looks for each quote in its passage. A citation that fails is removed. If none survive, you get "not in the docs" instead of a guess.',
  },
];

export function PipelineDiagram() {
  return (
    <ol
      aria-label="Pipeline"
      className="my-12 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-4"
    >
      {steps.map((step) => (
        <li key={step.label} className="border-border bg-card rounded-lg border p-5">
          <span className="text-primary font-mono text-xs font-medium">{step.label}</span>
          <h3 className="mt-2 font-semibold">{step.title}</h3>
          <p className="text-sm text-[var(--ink-2)]">{step.body}</p>
        </li>
      ))}
    </ol>
  );
}
