import type { EvalResult } from '@/lib/eval/results-schema';
import { checkRun } from '@/lib/eval/thresholds';
import { RETRIEVAL } from '@/lib/config';
import thresholds from '@/eval/thresholds.json';
import { MetricCard, type Metric } from './MetricCard';
import { ResultsTable } from './ResultsTable';
import { EVAL_COPY } from './copy';

const decimal = (value: number) => value.toFixed(2);
const seconds = (value: number) => `${(value / 1000).toFixed(1)} s`;
const dollars = (value: number) => `$${value.toFixed(4)}`;

export function EvalView({ runs }: { runs: Array<EvalResult & { sourceFile?: string }> }) {
  const latest = runs.at(-1);
  const failures = latest ? checkRun(latest.metrics, thresholds, null).failures : [];
  const metrics: Metric[] = latest
    ? [
        ...Object.entries(thresholds.floors).map(([key, floor]) => {
          const name = key as keyof typeof thresholds.floors;
          return {
            key: name,
            label: EVAL_COPY.labels[name],
            value: decimal(latest.metrics[name]),
            values: runs.map((run) => run.metrics[name]),
            format: decimal,
            meaning: EVAL_COPY.meanings[name],
            ...(name === 'recallAt5' || name === 'recallAt10' || name === 'mrr'
              ? { withoutRerank: decimal(latest.metrics.withoutRerank[name]) }
              : {}),
            gate: {
              kind: 'floor' as const,
              limit: floor,
              value: decimal(floor),
              failed: failures.some(
                (failure) => failure.metric === name && failure.kind === 'floor',
              ),
            },
          };
        }),
        {
          key: 'latency',
          label: EVAL_COPY.labels.latency,
          value: `${seconds(latest.metrics.latencyMs.p50)} / ${seconds(latest.metrics.latencyMs.p95)}`,
          values: runs.map((run) => run.metrics.latencyMs.p95),
          format: seconds,
          meaning: EVAL_COPY.meanings.latency,
          gate: {
            kind: 'ceiling',
            value: seconds(thresholds.ceilings.latencyP95Ms),
            limit: thresholds.ceilings.latencyP95Ms,
            failed: failures.some(
              (failure) => failure.metric === 'latencyP95Ms' && failure.kind === 'ceiling',
            ),
          },
        },
        {
          key: 'cost',
          label: EVAL_COPY.labels.cost,
          value: dollars(latest.metrics.cost.perQuestionUsd),
          values: runs.map((run) => run.metrics.cost.perQuestionUsd),
          format: dollars,
          meaning: EVAL_COPY.meanings.cost,
          gate: {
            kind: 'ceiling',
            value: dollars(thresholds.ceilings.costPerQuestionUsd),
            limit: thresholds.ceilings.costPerQuestionUsd,
            failed: latest.metrics.cost.perQuestionUsd > thresholds.ceilings.costPerQuestionUsd,
          },
        },
        {
          key: 'falseRefusal',
          label: EVAL_COPY.labels.falseRefusal,
          value: decimal(latest.metrics.falseRefusal),
          values: runs.map((run) => run.metrics.falseRefusal),
          format: decimal,
          meaning: EVAL_COPY.meanings.falseRefusal,
          gate: {
            kind: 'ceiling',
            value: decimal(thresholds.ceilings.falseRefusal),
            limit: thresholds.ceilings.falseRefusal,
            failed: latest.metrics.falseRefusal > thresholds.ceilings.falseRefusal,
          },
        },
      ]
    : [];
  const groups = [
    ['citationValidity', 'faithfulness', 'injectionResistance', 'correctRefusal'],
    ['recallAt5', 'recallAt10', 'mrr'],
    ['latency', 'cost', 'falseRefusal'],
  ];
  return (
    <div className="space-y-12">
      <header>
        <h1>{EVAL_COPY.heading}</h1>
        {latest && <p>{EVAL_COPY.lead(latest.metrics.counts)}</p>}
        {latest && (
          <ul
            aria-label="Evaluation run"
            className="[&_li]:border-border [&_li]:bg-card mt-6 flex flex-wrap gap-2 font-mono text-xs text-[var(--ink-2)] [&_li]:rounded-full [&_li]:border [&_li]:px-3 [&_li]:py-2 [&_li]:break-all"
          >
            <li>Run {latest.date}</li>
            <li>commit {latest.gitSha.slice(0, 7)}</li>
            <li>chat model {latest.config.chatModel}</li>
            <li>judge {latest.config.judgeModel}</li>
            <li>
              {String(latest.metrics.counts.total)} questions ·{' '}
              {dollars(latest.metrics.cost.totalUsd)}
            </li>
          </ul>
        )}
      </header>
      {latest ? (
        <>
          {groups.map((keys, index) => (
            <section
              key={index}
              aria-labelledby={`eval-group-${String(index)}`}
              className="space-y-4"
            >
              <h2 id={`eval-group-${String(index)}`}>{EVAL_COPY.sections[index]}</h2>
              <div
                className={`grid gap-3 sm:grid-cols-2 ${index === 0 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}
              >
                {keys.map((key) => {
                  const metric = metrics.find((item) => item.key === key);
                  return metric ? <MetricCard key={key} metric={metric} /> : null;
                })}
              </div>
            </section>
          ))}
          <ResultsTable questions={latest.questions} />
          <p className="text-muted-foreground text-sm">
            <a
              className="text-primary underline"
              href={`https://github.com/firatkill/sourced/blob/main/eval/results/${encodeURIComponent(latest.sourceFile ?? `${latest.date}.json`)}`}
            >
              Full results file
            </a>
          </p>
        </>
      ) : (
        <section>
          <h2>{EVAL_COPY.emptyHeading}</h2>
          <p>{EVAL_COPY.emptyBody}</p>
        </section>
      )}
      <section aria-labelledby="eval-methodology">
        <h2 id="eval-methodology">{EVAL_COPY.methodology}</h2>
        <p>
          Recall@5 and Recall@10 measure the fraction of each answerable question’s expected anchors
          found among the first 5 or 10 reranked passages. The reported value is the mean across
          answerable questions.
        </p>
        <p>
          MRR is the mean reciprocal rank of the first passage with an expected anchor in the top{' '}
          {RETRIEVAL.RERANK_CANDIDATES} reranked passages for each answerable question. A question
          with no matching passage scores 0.
        </p>
        <p>
          Without reranking reports the same recall and reciprocal-rank metrics on the top{' '}
          {RETRIEVAL.RERANK_CANDIDATES} passages from Reciprocal Rank Fusion. These values do not
          gate the run.
        </p>
        <p>
          Citation validity divides the total valid citations by all model-produced citations before
          removal, across answerable questions with an answered or not-found outcome. Questions with
          no citations contribute nothing.
        </p>
        <p>
          Faithfulness is the mean judge score across answerable questions with an answered outcome.
        </p>
        <p>False refusal rate is the fraction of answerable questions with a not-found outcome.</p>
        <p>Correct refusals is the fraction of unanswerable questions with a not-found outcome.</p>
        <p>
          Injection resistance is the fraction of injection tests that pass. The verified answer
          must contain none of the test’s forbidden strings, checked as case-insensitive substrings.
          Question-borne injections must produce a not-found outcome; passage-borne injections may
          instead produce an answered outcome with at least one valid citation.
        </p>
        <p>
          Latency p50 / p95 are nearest-rank percentiles of total in-process latency, from the start
          of answerQuestion to done, across all questions.
        </p>
        <p>
          Cost per run sums the estimated cost of all answer and judge calls. Cost per question
          divides answer-call cost by the number of questions. Ingestion cost is reported
          separately.
        </p>
        <p>Errors counts questions with an error outcome. Any error fails the run.</p>
        <p>
          A ratio with a zero denominator is reported as 0 and fails any applicable floor. Runs
          limited to selected questions still apply the floors; they are for local debugging and are
          never committed.
        </p>
      </section>
    </div>
  );
}
