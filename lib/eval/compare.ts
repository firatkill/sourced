import { readFile } from 'node:fs/promises';
import { InspectResult, type InspectFinding } from '@/lib/inspect/schema';
import { z } from 'zod';
import { EvalThresholds, metricValues } from './markdown';
import type { EvalResult } from './results-schema';
import { checkRun } from './thresholds';

export const EvalComparison = z.object({
  deltas: z.record(z.string(), z.number()),
  changedQuestions: z.array(z.string()),
  regressions: z.array(z.object({ metric: z.string(), value: z.number(), limit: z.number() })),
});
export type EvalComparison = z.infer<typeof EvalComparison>;

/** FR-85 / TRD §36.5: compare metrics and per-question results. */
export function compareResults(
  current: EvalResult,
  baseline: EvalResult,
  thresholds: EvalThresholds,
): EvalComparison {
  const prior = metricValues(baseline.metrics);
  const previous = new Map(baseline.questions.map((question) => [question.id, question]));
  const changedQuestions = current.questions
    .filter((question) => {
      const before = previous.get(question.id);
      return !before || JSON.stringify(question) !== JSON.stringify(before);
    })
    .map((question) => question.id);
  for (const question of baseline.questions)
    if (!current.questions.some((entry) => entry.id === question.id))
      changedQuestions.push(question.id);
  return {
    deltas: Object.fromEntries(
      Object.entries(metricValues(current.metrics)).map(([metric, value]) => [
        metric,
        value - (prior[metric] ?? 0),
      ]),
    ),
    changedQuestions,
    regressions: checkRun(current.metrics, thresholds, baseline.metrics)
      .failures.filter((failure) => failure.kind === 'regression')
      .map(({ metric, value, limit }) => ({ metric, value, limit })),
  };
}

export function renderComparison(comparison: EvalComparison): string {
  return [
    '| Metric | Delta |',
    '| --- | ---: |',
    ...Object.entries(comparison.deltas).map(
      ([metric, delta]) => `| ${metric} | ${String(Number(delta.toFixed(6)))} |`,
    ),
    `Changed questions: ${comparison.changedQuestions.join(', ') || 'None'}`,
  ].join('\n');
}

/** FR-84: corpus floors override the example defaults only when the file exists. */
export async function loadThresholds(corpus: string): Promise<EvalThresholds> {
  let text: string;
  try {
    text = await readFile(`eval/${corpus}/thresholds.json`, 'utf8');
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    text = await readFile('eval/thresholds.json', 'utf8');
  }
  return EvalThresholds.parse(JSON.parse(text));
}

/** Fixed diagnostic table, TRD §36.5 and D-126. */
export function likelyCause(
  metric: string,
  findings: readonly Pick<InspectFinding, 'code'>[],
): string | null {
  if (metric === 'recallAt5' || metric === 'recallAt10') {
    if (
      findings.some(
        (finding) => finding.code === 'tiny_chunks' || finding.code === 'oversized_chunks',
      )
    )
      return 'chunking';
    if (findings.some((finding) => finding.code === 'language_mismatch')) return 'language';
  }
  if (metric === 'citationValidity') return 'quote fallback rate and model';
  if (metric === 'correctRefusal') return 'not-found sentence or model';
  return null;
}

export async function readInspectFindings(corpus: string): Promise<InspectFinding[]> {
  let text: string;
  try {
    text = await readFile(`corpus/${corpus}/inspect.json`, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
    throw error;
  }
  const report = InspectResult.parse(JSON.parse(text));
  return report.corpus === corpus ? report.findings : [];
}

export function injectionScope(
  hasFixture: boolean,
): 'question-borne only' | 'question-borne and passage-borne' {
  return hasFixture ? 'question-borne and passage-borne' : 'question-borne only';
}
