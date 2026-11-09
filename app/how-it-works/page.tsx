import type { Metadata } from 'next';
import { PipelineDiagram } from '@/components/how/PipelineDiagram';
import { CHUNKING, GENERATION, RETRIEVAL } from '@/lib/config';

const LEAD =
  'Four steps run on the server for every question. The documentation itself was split, embedded and stored once, ahead of time.';

export const metadata: Metadata = {
  title: 'How it works · Sourced',
  description: LEAD,
};

export default function HowItWorks() {
  return (
    <article>
      <h1>What happens when you ask</h1>
      <p className="mt-4 max-w-[68ch]">{LEAD}</p>
      <PipelineDiagram />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-8 [&_h2]:mb-3">
          <section>
            <h2>1. Preparing the documents</h2>
            <p>
              The 35 PostgreSQL 17 documentation pages are parsed offline into sections, then split
              into chunks of {CHUNKING.MIN_TOKENS}–{CHUNKING.MAX_TOKENS} tokens with{' '}
              {CHUNKING.OVERLAP_TOKENS} tokens of overlap when a section needs splitting. Short
              sections can form smaller chunks. Each chunk keeps its heading and source URL. Its
              text and embedding are stored in Postgres with pgvector.
            </p>
          </section>
          <section>
            <h2>2. Hybrid search</h2>
            <p>
              The server embeds your question. Vector search finds the top{' '}
              {RETRIEVAL.VECTOR_CANDIDATES} passages by similarity, while keyword search finds the
              top {RETRIEVAL.FTS_CANDIDATES} text matches. Reciprocal Rank Fusion combines their
              ranks with k = {RETRIEVAL.RRF_K} and keeps the top {RETRIEVAL.RERANK_CANDIDATES}{' '}
              candidates.
            </p>
          </section>
          <section>
            <h2>3. Reranking</h2>
            <p>
              The chat model orders those {RETRIEVAL.RERANK_CANDIDATES} candidates by relevance to
              the question. The top {RETRIEVAL.FINAL_PASSAGES} passages go to the answer model. If
              reranking fails or times out, the server uses the fusion order.
            </p>
          </section>
          <section>
            <h2>4. Writing the answer</h2>
            <p>
              The model is instructed to answer only from the supplied passages, in no more than{' '}
              {GENERATION.ANSWER_WORD_LIMIT} words, with [P#] citations and supporting quotes. The
              answer streams as it is written; citations remain provisional until checking finishes.
            </p>
          </section>
          <section>
            <h2>5. Checking every citation</h2>
            <p>
              The server checks that each cited passage exists and that its supporting quote appears
              in the passage after normalization. Invalid citations are removed. If none remain, the
              answer is replaced with “{GENERATION.NOT_FOUND_SENTENCE}”
            </p>
          </section>
          <section>
            <h2>6. Measuring quality</h2>
            <p>
              An evaluation set checks retrieval and answer quality, including questions the
              documents cannot answer and prompt injection attempts. A faithfulness judge measures
              whether the passages support the answer. CI checks quality floors and regressions; the
              Evaluation page shows the recorded results.
            </p>
          </section>
          <section>
            <h2>8. Cost controls</h2>
            <p>
              Daily quotas limit live questions per visitor and across all visitors, resetting at
              midnight UTC. Suggested answers are prepared in advance and served without model calls
              or quota use. Read-only mode allows only these cached answers; off mode disables
              asking. Token counts and configured prices give an estimated cost for each request. If
              the provider fails before the first token is streamed, the request’s quota increments
              are refunded.
            </p>
          </section>
        </div>
        <aside className="[&_section]:border-border [&_section]:bg-card min-w-0 space-y-4 [&_section]:rounded-lg [&_section]:border [&_section]:p-6">
          <section id="privacy" className="scroll-mt-8">
            <h2>Privacy</h2>
            <p>
              Sourced does not store your questions. For each request it keeps a salted hash of the
              question, its length, timings, token counts, an estimated cost and how many citations
              passed or failed. Your IP address is turned into a salted hash that changes every day
              and is used only to count your daily questions; the IP itself is never stored or
              logged. There are no cookies, no analytics and no third-party scripts. The question is
              sent to OpenAI to produce the answer; see OpenAI’s API data usage policy.
            </p>
          </section>
          <section>
            <h2>7. Limits</h2>
            <ul className="list-disc space-y-2 pl-6">
              <li>Prompt-only defences against injection are not complete.</li>
              <li>
                A quote match proves the words exist in the passage, not that the passage fully
                supports the sentence. That is what the faithfulness judge measures.
              </li>
              <li>The corpus is 35 pages, not the full PostgreSQL documentation.</li>
              <li>
                The first request after a quiet period can be slow because the database scales to
                zero.
              </li>
            </ul>
          </section>
        </aside>
      </div>
    </article>
  );
}
