'use client';

// T-90 step 4 (and T-91's rebuild): the cost confirm, then live progress. Nothing goes to a
// provider before "Start indexing"; progress comes from the server, so the tab can close.
import { useCallback, useEffect, useRef, useState } from 'react';
import { setupApi, type Estimate, type IngestProgress } from './api';

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
  ollama: 'Ollama (this computer)',
  mock: 'Nobody (mock mode)',
};
export function money(value: number | null): string {
  if (value === null) return 'unknown';
  if (value === 0) return '$0';
  if (value < 0.0001) return 'under $0.0001';
  return value < 0.01 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}`;
}

// Mock mode calls no provider, so nothing is billed whatever the pricing table says.
const cost = (estimate: Estimate) => (estimate.provider === 'mock' ? 0 : estimate.estimatedCostUsd);

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-[var(--ink-3)]">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  );
}

export function IndexStep({
  initialJob,
  rebuild = false,
  doneHref = '/',
  doneLabel = 'Start chatting',
}: {
  initialJob: IngestProgress | null;
  rebuild?: boolean;
  doneHref?: string;
  doneLabel?: string;
}) {
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [job, setJob] = useState<IngestProgress | null>(initialJob);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const source = useRef<EventSource | null>(null);
  const active = job !== null && (job.status === 'preparing' || job.status === 'running');

  const loadEstimate = useCallback(() => {
    setEstimateError(null);
    setEstimate(null);
    setupApi.estimate(rebuild).then(setEstimate, (error: unknown) => {
      setEstimateError(error instanceof Error ? error.message : 'Could not estimate the cost.');
    });
  }, [rebuild]);
  useEffect(() => {
    // Only on mount: a running job shows progress instead, and a later failure keeps its panel.
    if (active) return;
    let current = true;
    setupApi.estimate(rebuild).then(
      (value) => {
        if (current) setEstimate(value);
      },
      (error: unknown) => {
        if (current)
          setEstimateError(error instanceof Error ? error.message : 'Could not estimate the cost.');
      },
    );
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const follow = useCallback((id: string) => {
    source.current?.close();
    const events = new EventSource(`/api/ingest/${encodeURIComponent(id)}/events`);
    source.current = events;
    events.addEventListener('progress', (event) => {
      const next = JSON.parse((event as MessageEvent<string>).data) as IngestProgress;
      setJob(next);
      if (next.status === 'succeeded' || next.status === 'failed') events.close();
    });
    events.onerror = () => {
      // The run continues on the server; the stream ends when it finishes.
      events.close();
    };
  }, []);
  useEffect(() => {
    if (initialJob && (initialJob.status === 'preparing' || initialJob.status === 'running'))
      follow(initialJob.id);
    return () => source.current?.close();
  }, [initialJob, follow]);

  async function start() {
    setStarting(true);
    setStartError(null);
    try {
      // The estimate said the embedding model changed: the run must rebuild to succeed.
      const { job: started } = await setupApi.startIngest(
        rebuild || estimate?.rebuildRequired === true,
      );
      setJob(started);
      follow(started.id);
    } catch (error) {
      setStartError(error instanceof Error ? error.message : 'Could not start indexing.');
    } finally {
      setStarting(false);
    }
  }

  if (job && job.status !== 'failed') {
    const { total, done, failed, skipped } = job.documents;
    const finished = done + failed + skipped;
    const percent = total > 0 ? Math.round((finished / total) * 100) : 0;
    const succeeded = job.status === 'succeeded';
    return (
      <section aria-labelledby="index-progress" className="space-y-5">
        <h2 id="index-progress" className="text-lg font-semibold">
          {succeeded ? 'Your documents are ready' : 'Indexing your documents'}
        </h2>
        <div>
          <div className="flex justify-between text-sm">
            <span className="font-semibold">
              {total > 0
                ? `${String(finished)} of ${String(total)} documents`
                : 'Reading your documents…'}
            </span>
            {failed > 0 && <span className="text-[var(--warn)]">{failed} could not be read</span>}
          </div>
          <div
            role="progressbar"
            aria-label="Indexing progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={succeeded ? 100 : percent}
            className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--rule)]"
          >
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500 motion-reduce:transition-none"
              style={{ width: `${String(succeeded ? 100 : percent)}%` }}
            />
          </div>
        </div>
        <p role="status" className="text-sm text-[var(--ink-2)]">
          {succeeded
            ? `Indexed ${String(done)} ${done === 1 ? 'document' : 'documents'}.`
            : 'You can close this tab. Indexing keeps going.'}
        </p>
        {succeeded ? (
          <a
            href={doneHref}
            className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-md)] bg-[var(--accent)] px-5 font-semibold text-[var(--accent-ink)]"
          >
            {doneLabel}
          </a>
        ) : null}
      </section>
    );
  }

  return (
    <section aria-labelledby="index-confirm" className="space-y-5">
      <h2 id="index-confirm" className="text-lg font-semibold">
        Confirm and index
      </h2>
      {job?.status === 'failed' && (
        <p
          role="alert"
          className="rounded-[var(--radius-md)] bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]"
        >
          {job.error?.message ?? 'Indexing stopped.'} Documents that finished are kept.
        </p>
      )}
      {estimateError ? (
        <div role="alert" className="space-y-3">
          <p className="text-[var(--danger)]">{estimateError}</p>
          <button
            type="button"
            onClick={loadEstimate}
            className="h-11 rounded-[var(--radius-md)] border border-[var(--rule-strong)] px-4"
          >
            Try again
          </button>
        </div>
      ) : estimate === null ? (
        <p role="status" className="text-[var(--ink-2)]">
          Counting your documents… nothing is sent anywhere yet.
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-1 gap-4 rounded-[var(--radius-lg)] border border-[var(--rule)] bg-[var(--surface)] p-4 sm:grid-cols-3">
            <Fact label="Sent to" value={PROVIDER_LABELS[estimate.provider] ?? estimate.provider} />
            <Fact
              label="Documents"
              value={`${String(estimate.documents)} · about ${estimate.embeddingTokens.toLocaleString('en')} tokens`}
            />
            <Fact label="Estimated cost" value={`${money(cost(estimate))}, once`} />
          </dl>
          {estimate.skipped > 0 && (
            <p className="text-sm text-[var(--ink-3)]">
              {estimate.skipped} {estimate.skipped === 1 ? 'file is' : 'files are'} skipped: the
              type is not supported or the file is over 50 MB.
            </p>
          )}
          {estimate.rebuildRequired && !rebuild && (
            <p className="text-sm text-[var(--warn)]">
              The embedding model changed, so the whole index is rebuilt.
            </p>
          )}
          {startError && (
            <p role="alert" className="text-sm text-[var(--danger)]">
              {startError}
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              void start();
            }}
            disabled={starting || estimate.documents === 0}
            className="inline-flex h-11 items-center rounded-[var(--radius-md)] bg-[var(--accent)] px-5 font-semibold text-[var(--accent-ink)] disabled:opacity-60"
          >
            {starting ? 'Starting…' : `Start indexing (${money(cost(estimate))})`}
          </button>
        </>
      )}
    </section>
  );
}
