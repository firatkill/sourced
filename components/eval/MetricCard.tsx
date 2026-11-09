import { EVAL_COPY } from './copy';

export type Metric = {
  key: string;
  label: string;
  value: string;
  values: number[];
  format: (value: number) => string;
  gate?: { kind: 'floor' | 'ceiling'; value: string; failed: boolean };
};

export function MetricCard({ metric }: { metric: Metric }) {
  const latest = metric.values.at(-1);
  const previous = metric.values.at(-2);
  const delta = latest !== undefined && previous !== undefined ? latest - previous : null;
  return (
    <article aria-label={metric.label} className="border-border bg-card rounded-md border p-5">
      <h3 className="mono">{metric.label}</h3>
      <p className="font-mono text-xl tabular-nums">{metric.value}</p>
      {metric.gate && (
        <p className="mono text-muted-foreground">
          {metric.gate.kind === 'floor' ? 'Floor' : 'Ceiling'} {metric.gate.value}
        </p>
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
    </article>
  );
}
