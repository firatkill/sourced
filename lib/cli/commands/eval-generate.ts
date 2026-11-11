import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { loadConfig } from '@/lib/kit/load-config';
import { setCliKitConfig, getKitConfig } from '@/lib/kit/runtime-config';
import { checkCorpusSchema } from '@/lib/kit/vector-schema';
import { getEnv } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { getProviders } from '@/lib/llm';
import { rolePrice } from '@/lib/cost/estimate';
import { countTokens } from '@/lib/ingest/tokenizer';
import { searchInTransaction } from '@/lib/retrieval/search';
import { RETRIEVAL, QUESTION } from '@/lib/config';
import {
  Candidate,
  GenerationChunk,
  GeneratedGoldenEntry,
  sampleChunks,
  generateAnswerCandidate,
  estimateGenerationCost,
  guardGenerationCost,
} from '@/lib/eval/generate';
import {
  GENERATE_SYSTEM_PROMPT,
  buildGeneratePrompt,
  GENERATE_UNANSWERABLE_SYSTEM_PROMPT,
  buildUnanswerablePrompt,
} from '@/lib/prompts/generate';
import type { CommandContext, Invocation } from '../router';
import { connectDatabase, repositoryRoot } from './database';
import { requireSources } from './config-files';
import { jsonLines, parseJsonLines } from './eval-review';

export async function runEvalGenerate(input: Invocation, context: CommandContext) {
  const config = await loadConfig(process.cwd(), { writeSnapshot: false });
  requireSources(config);
  setCliKitConfig(config);
  const source = typeof input.values.source === 'string' ? input.values.source : undefined;
  if (source && !config.sources.some((item) => item.id === source))
    throw new AppError('VALIDATION_FAILED', 'Unknown source id.');
  const count =
    input.values.count === undefined
      ? 30
      : z.coerce.number().int().nonnegative().parse(input.values.count);
  const env = getEnv();
  const sql = connectDatabase();
  try {
    const state = await checkCorpusSchema(sql, getKitConfig());
    const rows = GenerationChunk.array().parse(
      await sql`
      SELECT c.id::text, c.document_id::text AS "documentId", d.source_id AS "sourceId",
        d.section AS "group", c.ordinal, c.anchor, c.heading_path AS "headingPath",
        c.content, c.token_count AS "tokenCount"
      FROM chunks c JOIN documents d ON d.id=c.document_id
      WHERE NOT d.is_fixture ORDER BY c.id`,
    );
    const corpus = rows.filter((chunk) => !source || chunk.sourceId === source);
    if (!corpus.length) throw new AppError('CORPUS_EMPTY', 'Nothing is indexed yet.');
    const [version] = z.array(z.object({ corpus_version: z.string() })).parse(
      await sql`
      SELECT corpus_version FROM ingest_runs WHERE status='succeeded' AND corpus_version IS NOT NULL
      ORDER BY finished_at DESC, id DESC LIMIT 1`,
    );
    if (!version) throw new AppError('CORPUS_EMPTY', 'No completed corpus version is available.');
    // No seed CLI flag is specified in §34.1. The library accepts an explicit seed.
    const sampled = sampleChunks(corpus, count, version.corpus_version, 'sourced');
    const groups = [...new Set(corpus.map((chunk) => chunk.group))].sort();
    const groupPrompts = groups.map((group) =>
      buildUnanswerablePrompt(
        group,
        [
          ...new Set(
            corpus
              .filter((chunk) => chunk.group === group)
              .map((chunk) => chunk.headingPath.join(' > ')),
          ),
        ].sort(),
      ),
    );
    const answerPrompts = sampled.map((chunk) =>
      buildGeneratePrompt(
        chunk,
        corpus
          .filter(
            (other) =>
              other.documentId === chunk.documentId &&
              Math.abs(other.ordinal - chunk.ordinal) === 1,
          )
          .sort((a, b) => a.ordinal - b.ordinal)
          .map((other) => other.content),
      ),
    );
    const priceConfig = getKitConfig(false);
    const price = rolePrice('generate', priceConfig);
    const estimate = estimateGenerationCost(
      answerPrompts.reduce((sum, prompt) => sum + countTokens(GENERATE_SYSTEM_PROMPT + prompt), 0) +
        groupPrompts.reduce(
          (sum, prompt) => sum + countTokens(GENERATE_UNANSWERABLE_SYSTEM_PROMPT + prompt),
          0,
        ),
      (sampled.length + groups.length) * env.MAX_OUTPUT_TOKENS,
      price,
    );
    context.progress(
      `Generation cost estimate: ${estimate === null ? 'unknown' : `$${estimate.toFixed(6)}`}`,
    );
    if (input.values['dry-run']) return { written: 0, costUsd: estimate };
    if (estimate === null && !input.values.yes) {
      const model = priceConfig.models.generate ?? priceConfig.models.chat;
      throw new AppError(
        'NEEDS_CONFIRMATION',
        `Price unknown for ${model.provider}:${model.model}; add it to pricing in sourced.config.ts to get an estimate.`,
      );
    }
    guardGenerationCost(estimate, env.EVAL_MAX_COST_USD, input.values.yes === true);
    const providers = getProviders();
    const candidates: Candidate[] = [];
    const add = (candidate: Omit<Candidate, 'id'>) =>
      candidates.push(
        Candidate.parse({
          ...candidate,
          id: `q${String(candidates.length + 1).padStart(3, '0')}`,
        }),
      );
    let costUsd: number | null = price ? 0 : null;
    const charge = (usage: { inputTokens: number; outputTokens: number }) => {
      const cost = estimateGenerationCost(usage.inputTokens, usage.outputTokens, price);
      costUsd = costUsd === null || cost === null ? null : costUsd + cost;
      guardGenerationCost(costUsd, env.EVAL_MAX_COST_USD, input.values.yes === true);
    };
    for (const chunk of sampled) {
      const candidate = await generateAnswerCandidate(
        chunk,
        rows,
        providers.generate,
        async (question) => {
          const response = await providers.embed.embed([question]);
          const vector = response.vectors[0];
          if (!vector) throw new AppError('PROVIDER_ERROR', 'Embedding response was empty.');
          const hits = await sql.begin((tx) =>
            searchInTransaction(
              tx,
              vector,
              question,
              { limit: RETRIEVAL.RERANK_CANDIDATES },
              state.schema,
            ),
          );
          return hits.chunks.map((hit) => hit.chunkId);
        },
      );
      charge(candidate.usage);
      add({
        ...candidate,
        type: 'answerable',
        group: chunk.group,
        status: 'pending',
        origin: 'generated',
        forbidden_strings: [],
        notes: '',
      });
    }
    const UnanswerableOutput = z.object({
      questions: z
        .array(
          z
            .string()
            .min(QUESTION.MIN_CHARS)
            .max(QUESTION.MAX_CHARS)
            .refine((question) => {
              const words = question.trim().split(/\s+/).length;
              return words >= 6 && words <= 25;
            }),
        )
        .min(1),
    });
    for (const [index, group] of groups.entries()) {
      const response = await providers.generate.generateObject({
        model: 'generate',
        system: GENERATE_UNANSWERABLE_SYSTEM_PROMPT,
        prompt: groupPrompts[index] ?? '',
        schema: UnanswerableOutput,
        maxOutputTokens: env.MAX_OUTPUT_TOKENS,
      });
      charge(response.usage);
      for (const question of UnanswerableOutput.parse(response.object).questions)
        add({
          type: 'unanswerable',
          group,
          question,
          reference_answer: '',
          expected_anchors: [],
          forbidden_strings: [],
          notes: '',
          origin: 'generated',
          status: 'pending',
          flags: { needsHumanCheck: true },
          sourceChunkId: null,
        });
    }
    const injections = parseJsonLines(
      await readFile(join(repositoryRoot, 'eval/shared/injection.jsonl'), 'utf8'),
      GeneratedGoldenEntry,
    );
    for (const injection of injections)
      add({ ...injection, status: 'pending', flags: {}, sourceChunkId: null });
    const directory = join(process.cwd(), 'eval', config.corpus.name);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'candidates.jsonl'), jsonLines(candidates), 'utf8');
    return { written: candidates.length, costUsd };
  } finally {
    await sql.end();
  }
}
