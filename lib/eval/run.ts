import {
  compareResults,
  renderComparison,
  loadThresholds,
  likelyCause,
  readInspectFindings,
  injectionScope,
} from '@/lib/eval/compare';
import { AppError } from '@/lib/errors';
import type { KitConfig } from '@/lib/kit/config-schema';
import { getKitConfig } from '@/lib/kit/runtime-config';
import { checkCorpusSchema } from '@/lib/kit/vector-schema';
import { loadConfig } from '@/lib/kit/load-config';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import type { Dirent } from 'node:fs';
import { access, appendFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
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
import { missingGoldenAnchors, type GoldenEntry } from '@/lib/eval/golden';
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
import { renderMarkdown, renderMetricsTable, resultFileStem } from '@/lib/eval/markdown';
import { checkRun } from '@/lib/eval/thresholds';
import { readGoldenCorpus, loadGoldenSet, validateGoldenProfile, evalProfile } from './validate';

/** Resolve prices before calls; zero-fill only the known-cost budget calculation. */
export function resolveEvalConfig(config: KitConfig, yes = false) {
  const roles = ['chat', 'judge', 'embed', 'rerank'] as const;
  const knownConfig = structuredClone(config);
  for (const role of roles) {
    const model = config.models[role] ?? config.models.chat;
    if (rolePrice(role, config) === null) {
      if (!yes)
        throw new EvalAbort(
          2,
          `${role}: Price unknown for ${model.provider}:${model.model}; add it to pricing in sourced.config.ts to get an estimate.`,
        );
      knownConfig.pricing[`${model.provider}:${model.model}`] = {
        inputPerMTok: 0,
        outputPerMTok: 0,
      };
    }
  }
  const chat = rolePrice('chat', knownConfig);
  const judge = rolePrice('judge', knownConfig);
  const embed = rolePrice('embed', knownConfig);
  const prices: EvalPrices = {
    chatInput: chat?.inputPerMTok ?? 0,
    chatOutput: chat?.outputPerMTok ?? 0,
    judgeInput: judge?.inputPerMTok ?? 0,
    judgeOutput: judge?.outputPerMTok ?? 0,
    embed: embed?.inputPerMTok ?? 0,
  };
  return { prices, knownConfig, judgeKnown: rolePrice('judge', config) !== null };
}

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
    yes?: boolean;
    limitUsd: number;
    answer?: typeof answerQuestion;
    judge?: typeof judgeAnswer;
    now?: () => number;
    onQuestion?: (id: string) => void;
  },
): Promise<EvalRecord[]> {
  const priceConfig = getKitConfig(false);
  const resolved = resolveEvalConfig(priceConfig, options.yes);
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
      chapter: golden.group,
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
      record.answerCostUsd = answerCost;
      charge(estimateCost(outcome.usage, resolved.knownConfig) ?? 0);
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
                const knownCost = judgeCost(usage, options.prices);
                record.judgeCostUsd = resolved.judgeKnown ? knownCost : null;
                charge(knownCost);
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
    result.costUsd =
      record.answerCostUsd === null || record.judgeCostUsd === null
        ? null
        : record.answerCostUsd + record.judgeCostUsd;
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

type EvalGitOptions = {
  git?: (args: string[]) => string;
  onUnavailable?: () => void;
};

function gitOutput(args: string[]): string {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function gitUnavailable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if ('code' in error && error.code === 'ENOENT') return true;
  return (
    'stderr' in error &&
    (typeof error.stderr === 'string' || Buffer.isBuffer(error.stderr)) &&
    /fatal: not a git repository\b/.test(error.stderr.toString())
  );
}

export function readGitSha(options: EvalGitOptions = {}): string {
  try {
    return (options.git ?? gitOutput)(['rev-parse', 'HEAD']).trim();
  } catch (error) {
    if (!gitUnavailable(error)) throw error;
    options.onUnavailable?.();
    return 'none';
  }
}

async function diskBaselines(directory: string, outputFile: string) {
  let files: Dirent[];
  try {
    files = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
    throw error;
  }
  const results: { file: string; result: EvalResult }[] = [];
  for (const entry of files) {
    const file = join(directory, entry.name);
    if (!entry.isFile() || !file.endsWith('.json') || resolve(file) === resolve(outputFile))
      continue;
    // Only valid result files can become a fallback baseline. Filesystem errors
    // still surface; malformed or unrelated JSON is not an eval result.
    const text = await readFile(file, 'utf8');
    let json: unknown;
    try {
      json = JSON.parse(text) as unknown;
    } catch (error) {
      if (error instanceof SyntaxError) continue;
      throw error;
    }
    const parsed = EvalResult.safeParse(json);
    if (parsed.success) results.push({ file, result: parsed.data });
  }
  return results;
}

export async function loadBaseline(
  file: string | undefined,
  directory: string,
  outputFile: string,
  options: EvalGitOptions = {},
): Promise<{ file: string; result: EvalResult } | null> {
  if (file) return { file, result: EvalResult.parse(JSON.parse(await readFile(file, 'utf8'))) };
  const git = options.git ?? gitOutput;
  let results: { file: string; result: EvalResult }[];
  try {
    const files = git(['ls-tree', '-r', '--name-only', 'HEAD', '--', directory])
      .trim()
      .split('\n')
      .filter((path) => path.endsWith('.json') && resolve(path) !== resolve(outputFile));
    results = files.map((path) => ({
      file: path,
      result: EvalResult.parse(JSON.parse(git(['show', `HEAD:${path}`]))),
    }));
  } catch (error) {
    if (!gitUnavailable(error)) throw error;
    options.onUnavailable?.();
    results = await diskBaselines(directory, outputFile);
  }
  return results.sort((a, b) => b.result.runId.localeCompare(a.result.runId))[0] ?? null;
}

export async function runEval(
  args: string[] = [],
  output?: {
    result?: (result: EvalResult) => void;
    error?: (message: string, code?: AppError['code']) => void;
    write: (message: string) => void;
  },
): Promise<number> {
  const write =
    output?.write ??
    ((message: string) => {
      process.stdout.write(`${message}\n`);
    });
  let warnedAboutGit = false;
  const gitOptions: EvalGitOptions = {
    onUnavailable: () => {
      if (!warnedAboutGit) {
        write('Git not available; baseline taken from files on disk.');
        warnedAboutGit = true;
      }
    },
  };
  let stage = 'argument parsing';
  try {
    const { values } = parseArgs({
      args,
      options: {
        limit: { type: 'string' },
        only: { type: 'string' },
        baseline: { type: 'string' },
        compare: { type: 'string' },
        file: { type: 'string' },
        subset: { type: 'boolean', default: false },
        'no-write': { type: 'boolean', default: false },
        ci: { type: 'boolean', default: false },
        yes: { type: 'boolean', default: false },
      },
    });
    stage = 'configuration loading';
    await loadConfig();
    const env = getEnv();
    if (env.LLM_MODE === 'mock' && !values['no-write'])
      throw new EvalAbort(2, 'LLM_MODE=mock requires --no-write');
    stage = 'pricing';
    const priceConfig = getKitConfig(false);
    const { prices } = resolveEvalConfig(priceConfig, values.yes);
    if (priceConfig.profile === 'public-demo') {
      // Preserve the demo's zero-price guard, without treating confirmed unknowns
      // or explicitly free local providers as missing legacy PRICE_* values.
      const legacyPrices = { ...prices };
      for (const [role, keys] of [
        ['chat', ['chatInput', 'chatOutput']],
        ['judge', ['judgeInput', 'judgeOutput']],
        ['embed', ['embed']],
      ] as const) {
        const model = priceConfig.models[role] ?? priceConfig.models.chat;
        if (rolePrice(role, priceConfig) === null || model.provider === 'ollama')
          for (const key of keys) legacyPrices[key] = 1;
      }
      validatePrices(env.LLM_MODE, legacyPrices);
    }
    stage = 'golden set validation';
    const profile = evalProfile(getKitConfig().corpus.name);
    const parsed = await loadGoldenSet(
      await readFile(values.file ?? `eval/${getKitConfig().corpus.name}/golden.jsonl`, 'utf8'),
      profile,
    );
    const corpus =
      profile === 'example' ? await readGoldenCorpus() : { headings: [], identifiers: [] };
    const errors = [
      ...parsed.errors,
      ...validateGoldenProfile(parsed.entries, corpus, profile, parsed.injections, values.subset),
    ];
    if (errors.length) throw new EvalAbort(2, 'Invalid golden set; run pnpm eval:validate');
    stage = 'threshold loading';
    const thresholds = await loadThresholds(getKitConfig().corpus.name);
    const only =
      values.only === undefined
        ? null
        : z
            .array(z.string().regex(/^(?:q\d{3}|shared-inj-0[1-4])$/))
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
    stage = 'database preconditions';
    const sql = getSql();
    await checkCorpusSchema(sql, config);
    const fixture = await sql`SELECT 1 FROM documents WHERE is_fixture LIMIT 1`;
    const ingest = await sql<
      { corpus_version: string; cost_usd_estimate: string }[]
    >`SELECT corpus_version, cost_usd_estimate FROM ingest_runs WHERE status = 'succeeded' AND (${profile === 'kit'} OR include_fixtures) ORDER BY finished_at DESC LIMIT 1`;
    const mismatch = await sql`SELECT 1 FROM chunks WHERE embedding_model <> ${model} LIMIT 1`;
    checkPreconditions({
      mode: env.LLM_MODE,
      noWrite: values['no-write'],
      hasFixtures: profile === 'kit' || fixture.length > 0,
      hasIngest: ingest.length > 0,
      modelMismatch: mismatch.length > 0,
    });
    stage = 'anchor validation';
    const anchors = await sql<{ anchor: string }[]>`SELECT DISTINCT anchor FROM chunks`;
    if (
      missingGoldenAnchors(
        parsed.entries,
        anchors.map((row) => row.anchor),
      ).length
    )
      throw new EvalAbort(2, 'Missing golden anchors; run pnpm eval:validate');
    const runDate = new Date();
    const resultsDir =
      profile === 'example' ? env.EVAL_RESULTS_DIR : `eval/${config.corpus.name}/results`;
    const stem = await resultFileStem(resultsDir, () => runDate, exists);
    stage = 'baseline loading';
    const baseline = await loadBaseline(
      values.compare === 'baseline' ? values.baseline : (values.compare ?? values.baseline),
      resultsDir,
      `${stem}.json`,
      gitOptions,
    );
    checkBudget(
      projectCost(
        entries.length,
        entries.filter((e) => e.type === 'answerable').length,
        prices,
        baseline
          ? {
              totalUsd: baseline.result.metrics.cost.totalUsd ?? 0,
              count: baseline.result.metrics.counts.total,
            }
          : null,
      ),
      env.EVAL_MAX_COST_USD,
      env.LLM_MODE,
    );
    stage = 'question evaluation';
    const records = await evaluateQuestions(entries, {
      mode: env.LLM_MODE,
      prices,
      yes: values.yes,
      limitUsd: env.EVAL_MAX_COST_USD,
      onQuestion: (id) => {
        write(`Completed ${id}`);
      },
    });
    stage = 'result validation';
    const metrics = aggregateMetrics(records, Number(ingest[0]?.cost_usd_estimate ?? 0));
    const result = EvalResult.parse({
      schemaVersion: 1,
      runId: runDate.toISOString(),
      date: runDate.toISOString().slice(0, 10),
      gitSha: readGitSha(gitOptions),
      config: {
        chatModel: config.models.chat.model,
        judgeModel: (config.models.judge ?? config.models.chat).model,
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
    stage = 'inspection report loading';
    const findings = await readInspectFindings(config.corpus.name);
    result.failures = result.failures.map((failure) =>
      failure.kind === 'floor'
        ? { ...failure, likelyCause: likelyCause(failure.metric, findings) }
        : failure,
    );
    if (profile === 'kit') {
      result.injectionScope = injectionScope(fixture.length > 0);
      write(`Injection resistance: ${result.injectionScope}`);
    }
    for (const failure of result.failures)
      if (failure.kind === 'floor')
        write(`${failure.metric}: likelyCause=${failure.likelyCause ?? 'null'}`);
    if (values.compare && baseline) {
      result.comparison = compareResults(result, baseline.result, thresholds);
      write(renderComparison(result.comparison));
    }
    write(renderMetricsTable(result, baseline?.result.metrics ?? null));
    if (!baseline) write('No baseline');
    stage = 'report rendering';
    const markdown = renderMarkdown(result, baseline?.result.metrics ?? null);
    stage = 'report writing';
    if (!values['no-write']) {
      await mkdir(resultsDir, { recursive: true });
      await writeFile(`${stem}.json`, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
      await writeFile(`${stem}.md`, markdown, { flag: 'wx' });
    }
    if (values.ci && env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, markdown);
    output?.result?.(result);
    return result.pass ? 0 : 1;
  } catch (error) {
    const known = error instanceof EvalAbort || error instanceof AppError;
    const code =
      error instanceof EvalAbort
        ? 'NEEDS_CONFIRMATION'
        : error instanceof AppError
          ? error.code
          : 'INTERNAL_ERROR';
    const message = known ? error.message : `Eval failed during ${stage}.`;
    if (!known) {
      // Record structural diagnostics only: raw exceptions can contain SQL,
      // connection strings, question text, or provider output.
      createLogger({
        write: (line) => {
          process.stderr.write(line);
        },
      }).error({
        event: 'eval.failed',
        stage,
        errorType: error instanceof Error ? error.name : typeof error,
        ...(error instanceof Error &&
        'code' in error &&
        ['ENOENT', 'EACCES', 'ECONNREFUSED', 'ETIMEDOUT'].includes(String(error.code))
          ? { errorCode: error.code }
          : {}),
        ...(error instanceof z.ZodError
          ? {
              issues: error.issues.map((issue) => ({ path: issue.path, code: issue.code })),
            }
          : {}),
      });
    }
    if (output?.error) output.error(message, code);
    else if (output?.write) output.write(message);
    else process.stderr.write(`${message}\n`);
    return error instanceof EvalAbort
      ? error.exitCode
      : error instanceof AppError &&
          ['CORPUS_MISMATCH', 'CORPUS_EMPTY', 'NEEDS_CONFIRMATION'].includes(error.code)
        ? 2
        : 1;
  } finally {
    await closeSqlForTests();
  }
}
