import { TrendChart } from './TrendChart';
import { EVAL_COPY } from './copy';

export type Metric = {
  key: string;
  label: string;
  value: string;
  values: number[];
  format: (value: number) => string;
  meaning: string;
  withoutRerank?: string;
  gate?: { kind: 'floor' | 'ceiling'; value: string; limit: number; failed: boolean };
};

export function MetricCard({ metric }: { metric: Metric }) {
  const latest = metric.values.at(-1);
  const previous = metric.values.at(-2);
  const delta = latest !== undefined && previous !== undefined ? latest - previous : null;
  const scale =
    metric.gate && latest !== undefined
      ? metric.gate.kind === 'floor' || metric.key === 'falseRefusal'
        ? 1
        : Math.max(latest, metric.gate.limit) * 1.2
      : 1;
  return (
    <article aria-label={metric.label} className="border-border bg-card rounded-md border p-5">
      <h3 className="mono">{metric.label}</h3>
      <p className="font-mono text-xl tabular-nums">{metric.value}</p>
      {metric.gate && latest !== undefined && (
        <svg
          viewBox="0 0 100 8"
          preserveAspectRatio="none"
          aria-hidden="true"
          className="mt-4 h-2 w-full overflow-visible"
        >
          <rect width="100" height="8" rx="4" className="fill-[var(--rail)]" />
          <rect
            width={Math.max(0, Math.min(100, (latest / scale) * 100))}
            height="8"
            rx="4"
            className={metric.gate.failed ? 'fill-[var(--danger)]' : 'fill-[var(--ok)]'}
          />
          <path
            d={`M ${String((metric.gate.limit / scale) * 100)} -2 v12`}
            className="stroke-[var(--ink-3)]"
            strokeWidth="1"
          />
        </svg>
      )}
      {metric.gate && (
        <p className="mono text-muted-foreground">
          {metric.gate.kind === 'floor' ? 'Floor' : 'Ceiling'} {metric.gate.value} ·{' '}
          {metric.meaning}
        </p>
      )}
      {metric.withoutRerank !== undefined && (
        <p className="mono text-muted-foreground">Without reranking: {metric.withoutRerank}</p>
      )}
      <p className="mono text-muted-foreground">
        {delta === null
          ? EVAL_COPY.noPrevious
          : `${delta < 0 ? '−' : '+'}${metric.format(Math.abs(delta))} vs previous`}
      </p>
      {metric.gate?.failed && (
        <p className="mono text-destructive">
          {metric.gate.kind === 'floor' ? EVAL_COPY.belowFloor : EVAL_COPY.aboveCeiling}
        </p>
      )}
      {metric.values.length >= 2 && (
        <div className="border-border mt-4 border-t pt-3">
          <TrendChart label={metric.label} values={metric.values} format={metric.format} />
          <p className="small text-muted-foreground">{EVAL_COPY.trendCaption}</p>
        </div>
      )}
    </article>
  );
}
