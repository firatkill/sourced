import { z } from 'zod';
import type { EvalResult, Metrics } from './results-schema';

const floors = z.object({
  recallAt5: z.number(),
  recallAt10: z.number(),
  mrr: z.number(),
  citationValidity: z.number(),
  faithfulness: z.number(),
  correctRefusal: z.number(),
  injectionResistance: z.number(),
});
export const EvalThresholds = z.object({
  floors,
  ceilings: z.object({
    falseRefusal: z.number(),
    latencyP95Ms: z.number(),
    costPerQuestionUsd: z.number(),
    errors: z.number(),
  }),
  maxRegression: floors,
});
export type EvalThresholds = z.infer<typeof EvalThresholds>;

export function metricValues(metrics: Metrics): Record<string, number> {
  return {
    recallAt5: metrics.recallAt5,
    recallAt10: metrics.recallAt10,
    mrr: metrics.mrr,
    'withoutRerank.recallAt5': metrics.withoutRerank.recallAt5,
    'withoutRerank.recallAt10': metrics.withoutRerank.recallAt10,
    'withoutRerank.mrr': metrics.withoutRerank.mrr,
    citationValidity: metrics.citationValidity,
    faithfulness: metrics.faithfulness,
    falseRefusal: metrics.falseRefusal,
    correctRefusal: metrics.correctRefusal,
    injectionResistance: metrics.injectionResistance,
    latencyP50Ms: metrics.latencyMs.p50,
    latencyP95Ms: metrics.latencyMs.p95,
    costTotalUsd: metrics.cost.totalUsd,
    costPerQuestionUsd: metrics.cost.perQuestionUsd,
    ingestUsd: metrics.cost.ingestUsd,
    errors: metrics.errors,
  };
}

const cell = (value: string) => value.replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
const number = (value: number | null | undefined) =>
  value == null ? '—' : Number(value.toFixed(6)).toString();

export function renderMetricsTable(result: EvalResult, baseline: Metrics | null = null): string {
  const thresholds = EvalThresholds.parse(result.thresholds);
  const limits: Record<string, string> = {};
  for (const [key, value] of Object.entries(thresholds.floors)) limits[key] = `≥ ${number(value)}`;
  for (const [key, value] of Object.entries(thresholds.ceilings))
    limits[key] = `≤ ${number(value)}`;
  const prior = baseline ? metricValues(baseline) : {};
  return [
    '| Metric | Value | Floor or ceiling | Baseline | Delta | Status |',
    '| --- | ---: | --- | ---: | ---: | --- |',
    ...Object.entries(metricValues(result.metrics)).map(([key, value]) => {
      const base = prior[key];
      const status = result.failures.some((failure) => failure.metric === key)
        ? 'FAIL'
        : limits[key]
          ? 'PASS'
          : 'Reported';
      return `| ${key} | ${number(value)} | ${limits[key] ?? '—'} | ${number(base)} | ${number(base === undefined ? null : value - base)} | ${status} |`;
    }),
  ].join('\n');
}

export function renderMarkdown(result: EvalResult, baseline: Metrics | null = null): string {
  return [
    `# Eval ${result.date} · ${cell(result.gitSha)} · chat ${cell(result.config.chatModel)} · judge ${cell(result.config.judgeModel)} · embeddings ${cell(result.config.embeddingModel)}`,
    '',
    result.baseline
      ? `Baseline: ${cell(result.baseline.file)} (${cell(result.baseline.runId)})`
      : 'No baseline',
    '',
    renderMetricsTable(result, baseline),
    '',
    ...(result.injectionScope ? [`Injection resistance: ${result.injectionScope}`, ''] : []),
    '## Failures',
    '',
    ...(result.failures.length
      ? result.failures.map(
          (failure) =>
            `- ${failure.metric}: ${failure.kind}, value ${number(failure.value)}, limit ${number(failure.limit)}${failure.likelyCause !== undefined ? `; likelyCause: ${failure.likelyCause ?? 'null'}` : ''}`,
        )
      : ['None.']),
    '',
    '## Questions',
    '',
    '| ID | Type | R@5 | RR | Faithfulness | Citations (valid / invalid) | Pass |',
    '| --- | --- | ---: | ---: | ---: | --- | --- |',
    ...result.questions.map(
      (q) =>
        `| ${cell(q.id)} | ${cell(q.type)} | ${number(q.recallAt5)} | ${number(q.reciprocalRank)} | ${number(q.faithfulness?.score)} | ${String(q.citations.valid)} / ${String(q.citations.invalid)} | ${q.pass ? 'PASS' : 'FAIL'} |`,
    ),
    '',
  ].join('\n');
}

/** Both extensions reserve a name; injected clock and filesystem keep naming deterministic. */
export async function resultFileStem(
  directory: string,
  now: () => Date,
  exists: (path: string) => boolean | Promise<boolean>,
): Promise<string> {
  const date = now().toISOString().slice(0, 10);
  for (let suffix = 1; ; suffix++) {
    const stem = `${directory}/${date}${suffix === 1 ? '' : `-${String(suffix)}`}`;
    if (!(await exists(`${stem}.json`)) && !(await exists(`${stem}.md`))) return stem;
  }
}
