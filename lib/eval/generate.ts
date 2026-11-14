import { createHash } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '@/lib/errors';
import { getEnv } from '@/lib/env';
import { RETRIEVAL, QUESTION } from '@/lib/config';

/** The database boundary used by generation; bigint identifiers remain strings. */
export const GenerationChunk = z.object({
  id: z.string(),
  documentId: z.string(),
  sourceId: z.string(),
  group: z.string(),
  ordinal: z.number().int().nonnegative(),
  anchor: z.string(),
  headingPath: z.array(z.string()),
  content: z.string(),
  tokenCount: z.number().int().positive(),
});
export type GenerationChunk = z.infer<typeof GenerationChunk>;

/** TRD §36.2 step 1: stable round-robin across sources, documents, then chunks. */
export function sampleChunks(
  chunks: readonly GenerationChunk[],
  count: number,
  corpusVersion: string,
  seed: string,
): GenerationChunk[] {
  z.number().int().nonnegative().parse(count);
  const rank = (key: string) =>
    createHash('sha256')
      .update(JSON.stringify([corpusVersion, seed, key]))
      .digest('hex');
  const compare = (a: string, b: string) => rank(a).localeCompare(rank(b)) || a.localeCompare(b);
  const sources = new Map<string, Map<string, GenerationChunk[]>>();
  for (const chunk of chunks) {
    let documents = sources.get(chunk.sourceId);
    if (!documents) sources.set(chunk.sourceId, (documents = new Map<string, GenerationChunk[]>()));
    let document = documents.get(chunk.documentId);
    if (!document) documents.set(chunk.documentId, (document = []));
    document.push(chunk);
  }
  const queues = [...sources.keys()].sort(compare).map((source) => {
    const documents = sources.get(source);
    if (!documents) return [];
    const ordered = [...documents.keys()]
      .sort(compare)
      .map((id) =>
        [...(documents.get(id) ?? [])]
          .sort(
            (a, b) =>
              Number(b.tokenCount >= 300) - Number(a.tokenCount >= 300) || compare(a.id, b.id),
          )
          .slice(0, 2),
      );
    return [0, 1].flatMap((index) => ordered.flatMap((document) => document[index] ?? []));
  });
  const selected: GenerationChunk[] = [];
  for (let index = 0; selected.length < count; index++) {
    const round = queues.flatMap((queue) => queue[index] ?? []);
    if (!round.length) break;
    selected.push(...round.slice(0, count - selected.length));
  }
  return selected;
}

const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
export const GeneratedAnswer = z.object({
  question: z
    .string()
    .min(QUESTION.MIN_CHARS)
    .max(QUESTION.MAX_CHARS)
    .refine(
      (text) => wordCount(text) >= 6 && wordCount(text) <= 25,
      'Question must contain 6–25 words.',
    ),
  reference_answer: z
    .string()
    .refine((text) => wordCount(text) <= 80, 'Reference answer must contain at most 80 words.'),
  expected_anchors: z.array(z.string().regex(/^[^#\s]+#[^\s]+$/)).min(1),
});

/** TRD §36.2 step 3: nonexistent anchors are invalid; poor retrieval is reviewable. */
export function checkCandidate(
  answer: z.infer<typeof GeneratedAnswer>,
  sourceChunk: GenerationChunk,
  corpus: readonly GenerationChunk[],
  rrfTop20Ids: readonly string[],
): { hardRetrieval: boolean } {
  GeneratedAnswer.parse(answer);
  const anchors = new Set(corpus.map((chunk) => chunk.anchor));
  if (answer.expected_anchors.some((anchor) => !anchors.has(anchor))) {
    throw new AppError(
      'VALIDATION_FAILED',
      'Generated candidate refers to an anchor absent from the corpus.',
    );
  }
  return {
    hardRetrieval: !rrfTop20Ids.slice(0, RETRIEVAL.RERANK_CANDIDATES).includes(sourceChunk.id),
  };
}

export async function generateAnswerCandidate(
  chunk: GenerationChunk,
  corpus: readonly GenerationChunk[],
  provider: import('@/lib/llm/types').LlmProvider,
  retrieve: (question: string) => Promise<readonly string[]>,
) {
  const { GENERATE_SYSTEM_PROMPT, buildGeneratePrompt } = await import('@/lib/prompts/generate');
  const neighbours = corpus
    .filter(
      (other) =>
        other.documentId === chunk.documentId && Math.abs(other.ordinal - chunk.ordinal) === 1,
    )
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((other) => other.content);
  const response = await provider.generateObject({
    model: 'generate',
    system: GENERATE_SYSTEM_PROMPT,
    prompt: buildGeneratePrompt(chunk, neighbours),
    schema: GeneratedAnswer,
    maxOutputTokens: getEnv().MAX_OUTPUT_TOKENS,
  });
  const answer = GeneratedAnswer.parse(response.object);
  // Reject invalid anchors before spending tokens on the retrieval embedding.
  checkCandidate(answer, chunk, corpus, []);
  const flags = checkCandidate(answer, chunk, corpus, await retrieve(answer.question));
  return { ...answer, flags, sourceChunkId: chunk.id, usage: response.usage };
}

// T-67 will migrate the eval reader and validator profiles to this kit shape.
export const GeneratedGoldenEntry = z
  .object({
    id: z.string().regex(/^q\d{3}$/),
    type: z.enum(['answerable', 'unanswerable', 'injection']),
    group: z.string(),
    question: z.string().min(QUESTION.MIN_CHARS).max(QUESTION.MAX_CHARS),
    expected_anchors: z.array(z.string().regex(/^[^#\s]+#[^\s]+$/)),
    reference_answer: z.string(),
    forbidden_strings: z.array(z.string()).default([]),
    notes: z.string().default(''),
    origin: z.enum(['handwritten', 'generated']).default('handwritten'),
  })
  .superRefine((entry, context) => {
    if ((entry.type === 'answerable') !== entry.expected_anchors.length > 0)
      context.addIssue({ code: 'custom', message: 'Only answerable entries require anchors.' });
    if (entry.type === 'injection' && !entry.forbidden_strings.length)
      context.addIssue({ code: 'custom', message: 'Injection entries require forbidden strings.' });
  });
export const Candidate = GeneratedGoldenEntry.safeExtend({
  status: z.enum(['pending', 'accepted', 'rejected']),
  flags: z.object({
    hardRetrieval: z.boolean().optional(),
    needsHumanCheck: z.boolean().optional(),
  }),
  sourceChunkId: z.string().nullable(),
});
export type Candidate = z.infer<typeof Candidate>;

export function estimateGenerationCost(
  inputTokens: number,
  outputTokens: number,
  price: { inputPerMTok: number; outputPerMTok: number } | null,
): number | null {
  return price
    ? (inputTokens * price.inputPerMTok + outputTokens * price.outputPerMTok) / 1_000_000
    : null;
}

export function guardGenerationCost(cost: number | null, limit: number, yes: boolean): void {
  if (cost === null && !yes)
    throw new AppError(
      'NEEDS_CONFIRMATION',
      'Generation price is unknown. Add pricing or pass --yes.',
    );
  if (cost !== null && cost > limit)
    throw new AppError('NEEDS_CONFIRMATION', 'Generation estimate exceeds EVAL_MAX_COST_USD.');
}
