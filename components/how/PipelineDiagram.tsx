import { CHUNKING, RETRIEVAL } from '@/lib/config';

const requestSteps = [
  ['Question'],
  ['Embed'],
  [
    `Vector search (top ${String(RETRIEVAL.VECTOR_CANDIDATES)})`,
    `Keyword search (top ${String(RETRIEVAL.FTS_CANDIDATES)})`,
  ],
  [`Reciprocal Rank Fusion (top ${String(RETRIEVAL.RERANK_CANDIDATES)})`],
  [`Rerank (top ${String(RETRIEVAL.FINAL_PASSAGES)})`],
  ['Generate with [P#] citations'],
  ['Verify quotes'],
  ['Answer'],
];
const offlineSteps = [
  ['35 doc pages'],
  ['Parse'],
  [`Chunk (${String(CHUNKING.MIN_TOKENS)}–${String(CHUNKING.MAX_TOKENS)} tokens)`],
  ['Embed'],
  ['Postgres + pgvector'],
];

// Keep arrows connected when a lane wraps, while DOM order stays sequential.
const positions = [
  'sm:row-start-1 sm:col-start-1 lg:row-start-1 lg:col-start-1',
  'sm:row-start-1 sm:col-start-2 lg:row-start-1 lg:col-start-2',
  'sm:row-start-2 sm:col-start-2 lg:row-start-1 lg:col-start-3',
  'sm:row-start-2 sm:col-start-1 lg:row-start-1 lg:col-start-4',
  'sm:row-start-3 sm:col-start-1 lg:row-start-2 lg:col-start-4',
  'sm:row-start-3 sm:col-start-2 lg:row-start-2 lg:col-start-3',
  'sm:row-start-4 sm:col-start-2 lg:row-start-2 lg:col-start-2',
  'sm:row-start-4 sm:col-start-1 lg:row-start-2 lg:col-start-1',
];

function Lane({ label, steps }: { label: string; steps: string[][] }) {
  return (
    <ol
      aria-label={label}
      className="grid list-none grid-cols-1 gap-6 p-0 sm:grid-cols-2 lg:grid-cols-4"
    >
      {steps.map((step, index) => (
        <li
          key={step.join()}
          className={`relative grid content-center gap-2 ${positions[index] ?? ''}`}
        >
          {step.map((text) => (
            <span
              key={text}
              className="border-border bg-card rounded-md border p-3 font-mono text-[13px] leading-5"
            >
              {text}
            </span>
          ))}
          {index < steps.length - 1 && (
            <svg
              aria-hidden="true"
              focusable="false"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              className={`text-muted-foreground absolute -bottom-6 left-1/2 size-6 -translate-x-1/2 ${
                index % 2 === 1
                  ? ''
                  : index % 4 === 0
                    ? 'sm:top-1/2 sm:-right-6 sm:bottom-auto sm:left-auto sm:translate-x-0 sm:-translate-y-1/2 sm:-rotate-90'
                    : 'sm:top-1/2 sm:right-auto sm:bottom-auto sm:-left-6 sm:translate-x-0 sm:-translate-y-1/2 sm:rotate-90'
              } ${
                index === 3
                  ? 'lg:top-auto lg:right-auto lg:-bottom-6 lg:left-1/2 lg:-translate-x-1/2 lg:translate-y-0 lg:rotate-0'
                  : index < 3
                    ? 'lg:top-1/2 lg:-right-6 lg:bottom-auto lg:left-auto lg:translate-x-0 lg:-translate-y-1/2 lg:-rotate-90'
                    : 'lg:top-1/2 lg:right-auto lg:bottom-auto lg:-left-6 lg:translate-x-0 lg:-translate-y-1/2 lg:rotate-90'
              }`}
            >
              <path d="M12 3v18m-7-7 7 7 7-7" />
            </svg>
          )}
        </li>
      ))}
    </ol>
  );
}

export function PipelineDiagram() {
  return (
    <figure className="my-8 space-y-8">
      <Lane label="Request path" steps={requestSteps} />
      <Lane label="Offline ingestion" steps={offlineSteps} />
      <figcaption className="small text-muted-foreground">
        Request path above, offline ingestion below.
      </figcaption>
    </figure>
  );
}
