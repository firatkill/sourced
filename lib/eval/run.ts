import { AppError } from '@/lib/errors';
import { getKitConfig } from '@/lib/kit/runtime-config';
import { checkCorpusSchema } from '@/lib/kit/vector-schema';
import { loadConfig } from '@/lib/kit/load-config';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { access, appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { RETRIEVAL } from '@/lib/config';
import { estimateCost, rolePrice } from '@/lib/cost/estimate';
import { getEnv } from '@/lib/env';
import { closeSqlForTests, getSql } from '@/lib/db/client';
import { answerQuestion } from '@/lib/generation/answer';
import { createLogger } from '@/lib/logger';
import { PROMPT_VERSION } from '@/lib/prompts/version';
import type { SseEvent } from '@/lib/sse/events';
import {
  parseGolden,
  validateGolden,
  missingGoldenAnchors,
  type GoldenEntry,
} from '@/lib/eval/golden';
import {
  accrueCost,
  checkBudget,
  EvalAbort,
  judgeCost,
  projectCost,
  validatePrices,
  type EvalPrices,
} from '@/lib/eval/budget';
import { judgeAnswer } from '@/lib/eval/judge';
import {
  aggregateMetrics,
  injectionResisted,
  questionPass,
  recallAt,
  reciprocalRank,
  type EvalRecord,
} from '@/lib/eval/metrics';
import { EvalResult, type QuestionResult } from '@/lib/eval/results-schema';
import {
  EvalThresholds,
  renderMarkdown,
  renderMetricsTable,
  resultFileStem,
} from '@/lib/eval/markdown';
import { checkRun } from '@/lib/eval/thresholds';
import { readGoldenCorpus } from './validate';

export function checkPreconditions(input: {
  mode: 'mock' | 'live';
  noWrite: boolean;
  hasFixtures: boolean;
  hasIngest: boolean;
  modelMismatch: boolean;
}): void {
  if (input.mode === 'mock' && !input.noWrite)
    throw new EvalAbort(2, 'LLM_MODE=mock requires --no-write');
  if (!input.hasFixtures || !input.hasIngest)
    throw new EvalAbort(2, 'Run pnpm ingest --include-fixtures first');
  if (input.modelMismatch)
    throw new EvalAbort(
      2,
      'Re-run pnpm ingest --offline --include-fixtures in the current LLM_MODE',
    );
}

export async function evaluateQuestions(
  entries: readonly GoldenEntry[],
  options: {
    mode: 'mock' | 'live';
    prices: EvalPrices;
    limitUsd: number;
    answer?: typeof answerQuestion;
    judge?: typeof judgeAnswer;
    now?: () => number;
    onQuestion?: (id: string) => void;
  },
): Promise<EvalRecord[]> {
  const priceConfig = getKitConfig(false);
  const unpricedRole = (['embed', 'chat', 'rerank'] as const).find(
    (role) => rolePrice(role, priceConfig) === null,
  );
  if (unpricedRole) {
    const model = priceConfig.models[unpricedRole] ?? priceConfig.models.chat;
    throw new EvalAbort(
      2,
      `Price unknown for ${model.provider}:${model.model}; add it to pricing in sourced.config.ts to get an estimate.`,
    );
  }
  const records: EvalRecord[] = [];
  let accrued = 0;
  const now = options.now ?? (() => performance.now());
  const charge = (cost: number) => {
    accrued = accrueCost(accrued, cost);
    checkBudget(accrued, options.limitUsd, options.mode);
  };
  for (const golden of entries) {
    const start = now();
    const events: SseEvent[] = [];
    const result: QuestionResult = {
      id: golden.id,
      type: golden.type,
      chapter: golden.chapter,
      question: golden.question,
      outcome: 'error',
      recallAt5: golden.type === 'answerable' ? 0 : null,
      recallAt10: golden.type === 'answerable' ? 0 : null,
      reciprocalRank: golden.type === 'answerable' ? 0 : null,
      citations: { valid: 0, invalid: 0, reasons: [] },
      quoteFallbackUsed: false,
      faithfulness: null,
      refusalCorrect: golden.type === 'unanswerable' ? false : null,
      injectionResisted: golden.type === 'injection' ? false : null,
      pass: false,
      latencyMs: 0,
      costUsd: 0,
      answer: '',
      citedAnchors: [],
      rerankedTop10Anchors: [],
    };
    const record: EvalRecord = {
      golden,
      result,
      rrfTop20Anchors: [],
      rerankedTop20Anchors: [],
      passageLabels: [],
      answerCostUsd: 0,
      judgeCostUsd: 0,
      usage: { answer: null, judge: null },
    };
    try {
      const outcome = await (options.answer ?? answerQuestion)({
        question: golden.question,
        requestId: randomUUID(),
        signal: new AbortController().signal,
        emit: (event) => {
          events.push(event);
        },
      });
      const verification = outcome.verification;
      record.usage.answer = outcome.usage;
      const answerCost = estimateCost(outcome.usage, priceConfig);
      if (answerCost === null) throw new EvalAbort(2, 'Price configuration changed during eval.');
      record.answerCostUsd = answerCost;
      charge(record.answerCostUsd);
      record.rrfTop20Anchors = outcome.candidates.map((chunk) => chunk.anchor);
      record.rerankedTop20Anchors = outcome.reranked.map((chunk) => chunk.anchor);
      record.passageLabels = outcome.passages.map((p) => p.label);
      result.outcome = verification.notFound ? 'not_found' : 'answered';
      result.answer = verification.answer;
      result.latencyMs = outcome.timingsMs.total;
      result.citations = {
        valid: verification.valid.length,
        invalid: verification.invalid.length,
        reasons: verification.invalid.map((citation) => citation.reason),
      };
      result.quoteFallbackUsed = verification.quoteFallbackUsed;
      result.citedAnchors = outcome.passages
        .filter((p) => verification.valid.some((citation) => citation.label === p.label))
        .map((p) => p.anchor);
      result.rerankedTop10Anchors = record.rerankedTop20Anchors.slice(0, 10);
      if (golden.type === 'answerable') {
        result.recallAt5 = recallAt(golden.expected_anchors, record.rerankedTop20Anchors, 5);
        result.recallAt10 = recallAt(golden.expected_anchors, record.rerankedTop20Anchors, 10);
        result.reciprocalRank = reciprocalRank(
          golden.expected_anchors,
          record.rerankedTop20Anchors,
        );
        if (result.outcome === 'answered') {
          const judge = await (options.judge ?? judgeAnswer)(
            result.answer,
            outcome.passages.map((p) => ({ id: p.label, content: p.content })),
            {
              onUsage: (usage) => {
                record.usage.judge = usage;
                record.judgeCostUsd = judgeCost(usage, options.prices);
                charge(record.judgeCostUsd);
              },
            },
          );
          result.faithfulness = {
            score: judge.score,
            unsupportedClaims: judge.unsupported_claims,
            rationale: judge.rationale,
          };
        }
      }
    } catch (error) {
      if (error instanceof EvalAbort) throw error;
      result.outcome = 'error';
      // Preserve answerQuestion latency on judge failures; failed answers have no done event.
      if (!record.usage.answer) result.latencyMs = now() - start;
      createLogger({
        write: (message) => {
          process.stderr.write(message);
        },
      }).warn({ event: 'eval.question_failed', questionId: golden.id });
    }
    result.costUsd = record.answerCostUsd + record.judgeCostUsd;
    if (golden.type === 'unanswerable') result.refusalCorrect = result.outcome === 'not_found';
    if (golden.type === 'injection') result.injectionResisted = injectionResisted(golden, result);
    result.pass = questionPass(result);
    records.push(record);
    options.onQuestion?.(golden.id);
  }
  return records;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}

export async function loadBaseline(
  file: string | undefined,
  directory: string,
  outputFile: string,
): Promise<{ file: string; result: EvalResult } | null> {
  if (file) return { file, result: EvalResult.parse(JSON.parse(await readFile(file, 'utf8'))) };
  const files = execFileSync('git', ['ls-tree', '-r', '--name-only', 'HEAD', '--', directory], {
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .filter((path) => path.endsWith('.json') && resolve(path) !== resolve(outputFile));
  const results = files.map((path) => ({
    file: path,
    result: EvalResult.parse(
      JSON.parse(execFileSync('git', ['show', `HEAD:${path}`], { encoding: 'utf8' })),
    ),
  }));
  return results.sort((a, b) => b.result.runId.localeCompare(a.result.runId))[0] ?? null;
}

export async function runEval(
  args: string[] = [],
  output?: {
    result?: (result: EvalResult) => void;
    error?: (message: string) => void;
    write: (message: string) => void;
  },
): Promise<number> {
  const write =
    output?.write ??
    ((message: string) => {
      process.stdout.write(`${message}\n`);
    });
  try {
    const { values } = parseArgs({
      args,
      options: {
        limit: { type: 'string' },
        only: { type: 'string' },
        baseline: { type: 'string' },
        'no-write': { type: 'boolean', default: false },
        ci: { type: 'boolean', default: false },
      },
    });
    await loadConfig();
    const env = getEnv();
    if (env.LLM_MODE === 'mock' && !values['no-write'])
      throw new EvalAbort(2, 'LLM_MODE=mock requires --no-write');
    if (!env.JUDGE_MODEL || !env.CHAT_MODEL)
      throw new EvalAbort(2, 'Set CHAT_MODEL and JUDGE_MODEL');
    const prices: EvalPrices = {
      chatInput: env.PRICE_CHAT_INPUT_PER_MTOK,
      chatOutput: env.PRICE_CHAT_OUTPUT_PER_MTOK,
      judgeInput: env.PRICE_JUDGE_INPUT_PER_MTOK,
      judgeOutput: env.PRICE_JUDGE_OUTPUT_PER_MTOK,
      embed: env.PRICE_EMBED_PER_MTOK,
    };
    validatePrices(env.LLM_MODE, prices);
    const parsed = parseGolden(
      await readFile(`eval/${getKitConfig().corpus.name}/golden.jsonl`, 'utf8'),
    );
    const errors = [...parsed.errors, ...validateGolden(parsed.entries, await readGoldenCorpus())];
    if (errors.length) throw new EvalAbort(2, 'Invalid golden set; run pnpm eval:validate');
    const thresholds = EvalThresholds.parse(
      JSON.parse(await readFile('eval/thresholds.json', 'utf8')),
    );
    const only =
      values.only === undefined
        ? null
        : z
            .array(z.string().regex(/^q\d{3}$/))
            .min(1)
            .parse(values.only.split(','));
    if (only?.some((id) => !parsed.entries.some((e) => e.id === id)))
      throw new EvalAbort(2, 'Unknown question id in --only');
    const limit =
      values.limit === undefined
        ? undefined
        : z.coerce.number().int().positive().parse(values.limit);
    const entries = parsed.entries.filter((e) => !only || only.includes(e.id)).slice(0, limit);
    const config = getKitConfig();
    const model = config.models.embed.model;
    const sql = getSql();
    await checkCorpusSchema(sql, config);
    const fixture = await sql`SELECT 1 FROM documents WHERE is_fixture LIMIT 1`;
    const ingest = await sql<
      { corpus_version: string; cost_usd_estimate: string }[]
    >`SELECT corpus_version, cost_usd_estimate FROM ingest_runs WHERE status = 'succeeded' AND include_fixtures ORDER BY finished_at DESC LIMIT 1`;
    const mismatch = await sql`SELECT 1 FROM chunks WHERE embedding_model <> ${model} LIMIT 1`;
    checkPreconditions({
      mode: env.LLM_MODE,
      noWrite: values['no-write'],
      hasFixtures: fixture.length > 0,
      hasIngest: ingest.length > 0,
      modelMismatch: mismatch.length > 0,
    });
    const anchors = await sql<{ anchor: string }[]>`SELECT DISTINCT anchor FROM chunks`;
    if (
      missingGoldenAnchors(
        parsed.entries,
        anchors.map((row) => row.anchor),
      ).length
    )
      throw new EvalAbort(2, 'Missing golden anchors; run pnpm eval:validate');
    const runDate = new Date();
    const stem = await resultFileStem(env.EVAL_RESULTS_DIR, () => runDate, exists);
    const baseline = await loadBaseline(values.baseline, env.EVAL_RESULTS_DIR, `${stem}.json`);
    checkBudget(
      projectCost(
        entries.length,
        entries.filter((e) => e.type === 'answerable').length,
        prices,
        baseline
          ? {
              totalUsd: baseline.result.metrics.cost.totalUsd,
              count: baseline.result.metrics.counts.total,
            }
          : null,
      ),
      env.EVAL_MAX_COST_USD,
      env.LLM_MODE,
    );
    const records = await evaluateQuestions(entries, {
      mode: env.LLM_MODE,
      prices,
      limitUsd: env.EVAL_MAX_COST_USD,
      onQuestion: (id) => {
        write(`Completed ${id}`);
      },
    });
    const metrics = aggregateMetrics(records, Number(ingest[0]?.cost_usd_estimate ?? 0));
    const result = EvalResult.parse({
      schemaVersion: 1,
      runId: runDate.toISOString(),
      date: runDate.toISOString().slice(0, 10),
      gitSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      config: {
        chatModel: env.CHAT_MODEL,
        judgeModel: env.JUDGE_MODEL,
        embeddingModel: model,
        promptVersion: PROMPT_VERSION,
        corpusVersion: ingest[0]?.corpus_version ?? '',
        retrieval: {
          vectorCandidates: RETRIEVAL.VECTOR_CANDIDATES,
          ftsCandidates: RETRIEVAL.FTS_CANDIDATES,
          rrfK: RETRIEVAL.RRF_K,
          rerankCandidates: RETRIEVAL.RERANK_CANDIDATES,
          finalPassages: RETRIEVAL.FINAL_PASSAGES,
        },
      },
      metrics,
      thresholds,
      baseline: baseline ? { runId: baseline.result.runId, file: baseline.file } : null,
      ...checkRun(metrics, thresholds, baseline?.result.metrics ?? null),
      questions: records.map((r) => r.result),
    });
    write(renderMetricsTable(result, baseline?.result.metrics ?? null));
    if (!baseline) write('No baseline');
    const markdown = renderMarkdown(result, baseline?.result.metrics ?? null);
    if (!values['no-write']) {
      await mkdir(env.EVAL_RESULTS_DIR, { recursive: true });
      await writeFile(`${stem}.json`, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
      await writeFile(`${stem}.md`, markdown, { flag: 'wx' });
    }
    if (values.ci && env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, markdown);
    output?.result?.(result);
    return result.pass ? 0 : 1;
  } catch (error) {
    (
      output?.error ??
      output?.write ??
      ((message: string) => {
        process.stderr.write(`${message}\n`);
      })
    )(
      error instanceof EvalAbort ||
        (error instanceof AppError &&
          ['CONFIG_INVALID', 'CORPUS_MISMATCH', 'CORPUS_EMPTY'].includes(error.code))
        ? error.message
        : 'Eval configuration failed; check arguments, files, environment and database.',
    );
    return error instanceof EvalAbort
      ? error.exitCode
      : error instanceof AppError && error.code === 'CONFIG_INVALID'
        ? 1
        : 2;
  } finally {
    await closeSqlForTests();
  }
}
