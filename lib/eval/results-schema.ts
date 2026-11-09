import { z } from 'zod';

export const EvalResult = z.object({
  schemaVersion: z.literal(1),
  runId: z.string(), // ISO timestamp, e.g. '2026-11-02T14:03:11Z'
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  gitSha: z.string(),
  config: z.object({
    chatModel: z.string(),
    judgeModel: z.string(),
    embeddingModel: z.string(),
    promptVersion: z.string(),
    corpusVersion: z.string(),
    retrieval: z.object({
      vectorCandidates: z.number(),
      ftsCandidates: z.number(),
      rrfK: z.number(),
      rerankCandidates: z.number(),
      finalPassages: z.number(),
    }),
  }),
  metrics: z.object({
    recallAt5: z.number(),
    recallAt10: z.number(),
    mrr: z.number(),
    withoutRerank: z.object({ recallAt5: z.number(), recallAt10: z.number(), mrr: z.number() }),
    citationValidity: z.number(),
    faithfulness: z.number(),
    falseRefusal: z.number(),
    correctRefusal: z.number(),
    injectionResistance: z.number(),
    latencyMs: z.object({ p50: z.number(), p95: z.number() }),
    cost: z.object({ totalUsd: z.number(), perQuestionUsd: z.number(), ingestUsd: z.number() }),
    errors: z.number().int(),
    counts: z.object({
      total: z.number(),
      answerable: z.number(),
      unanswerable: z.number(),
      injection: z.number(),
    }),
  }),
  thresholds: z.unknown(), // copy of thresholds.json used
  baseline: z.object({ runId: z.string(), file: z.string() }).nullable(),
  pass: z.boolean(),
  failures: z.array(
    z.object({
      metric: z.string(),
      kind: z.enum(['floor', 'ceiling', 'regression']),
      value: z.number(),
      limit: z.number(),
    }),
  ),
  questions: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      chapter: z.string(),
      question: z.string(),
      outcome: z.enum(['answered', 'not_found', 'error']),
      recallAt5: z.number().nullable(),
      recallAt10: z.number().nullable(),
      reciprocalRank: z.number().nullable(),
      citations: z.object({ valid: z.number(), invalid: z.number(), reasons: z.array(z.string()) }),
      quoteFallbackUsed: z.boolean(),
      faithfulness: z
        .object({
          score: z.number(),
          unsupportedClaims: z.array(z.string()),
          rationale: z.string(),
        })
        .nullable(),
      refusalCorrect: z.boolean().nullable(),
      injectionResisted: z.boolean().nullable(),
      pass: z.boolean(), // per-question verdict used by /eval "Result"
      latencyMs: z.number(),
      costUsd: z.number(),
      answer: z.string(),
      citedAnchors: z.array(z.string()), // anchors of passages with a valid citation, in label order; shown in the expanded /eval row
      rerankedTop10Anchors: z.array(z.string()),
    }),
  ),
});

export type EvalResult = z.infer<typeof EvalResult>;
export type QuestionResult = EvalResult['questions'][number];
export type Metrics = EvalResult['metrics'];
