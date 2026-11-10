import { z } from 'zod';
import { CHUNKING, RETRIEVAL } from '@/lib/config';
import { getConfigEnv } from '@/lib/env';
import { modelCapabilities } from '@/lib/llm/models';

const RoleModel = z.object({
  provider: z.enum(['openai', 'gemini', 'anthropic', 'ollama', 'mock']),
  model: z.string().min(1),
});

const EmbedModel = RoleModel.extend({
  provider: z.enum(['openai', 'gemini', 'ollama', 'mock']), // anthropic has no embeddings (FR-60)
  dimensions: z.number().int().positive().max(4000),
});

const Pricing = z.object({
  // USD per 1M tokens; omit for unknown, 0 for local
  inputPerMTok: z.number().nonnegative(),
  outputPerMTok: z.number().nonnegative().default(0),
});

const SourceBase = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/),
  group: z
    .string()
    .regex(/^[a-z0-9-]{1,40}$/)
    .optional(), // replaces the v1 golden "chapter"
  include: z.array(z.string()).default([]), // picomatch globs on path or URL path
  exclude: z.array(z.string()).default([]),
  html: z
    .object({
      preset: z.enum(['generic', 'postgres-docbook']).default('generic'),
      contentSelector: z.string().optional(),
      removeSelectors: z.array(z.string()).default([]),
    })
    .prefault({}),
});

export const SourceSchema = z.discriminatedUnion('type', [
  SourceBase.extend({
    type: z.literal('folder'),
    path: z.string().min(1),
    commitRaw: z.boolean().default(false),
  }),
  SourceBase.extend({
    type: z.literal('urls'),
    urls: z.array(z.url()).min(1),
    commitRaw: z.boolean().default(false),
  }),
  SourceBase.extend({
    type: z.literal('sitemap'),
    url: z.url(),
    maxPages: z.number().int().positive().default(5000),
    commitRaw: z.boolean().default(false),
  }),
  SourceBase.extend({
    type: z.literal('crawl'),
    root: z.url(),
    maxDepth: z.number().int().min(0).max(10).default(3),
    maxPages: z.number().int().positive().default(1000),
    commitRaw: z.boolean().default(false),
  }),
  SourceBase.extend({
    type: z.literal('git'),
    path: z.string().min(1),
    subdir: z.string().default(''),
  }),
]);

const BaseKitConfigSchema = z.object({
  schemaVersion: z.literal(1),
  corpus: z.object({
    name: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/), // directory name under corpus/ and eval/
    title: z.string().min(1).max(60),
    description: z.string().min(1).max(200),
    language: z.string().regex(/^[a-z]{2}$/), // ISO 639-1
    attribution: z.string().max(300).optional(),
    linkLabel: z.string().max(40).default('Read the source'),
  }),
  sources: z.array(SourceSchema).min(1),
  models: z.object({
    chat: RoleModel,
    rerank: RoleModel.optional(), // defaults to chat
    judge: RoleModel.optional(), // defaults to chat
    generate: RoleModel.optional(), // eval:generate; defaults to chat
    embed: EmbedModel,
  }),
  pricing: z.record(z.string(), Pricing).default({}), // key: "<provider>:<model>"
  profile: z.enum(['local', 'private', 'public-demo']).default('local'),
  copy: z
    .object({
      hero: z.string().max(120).optional(),
      lead: z.string().max(300).optional(),
      notFound: z.string().max(120).optional(),
      documentTitle: z.string().max(80).optional(),
      shortTitle: z.string().max(40).optional(),
      headerScope: z.string().max(120).optional(),
      scope: z.string().max(300).optional(),
      placeholder: z.string().max(120).optional(),
      nextPlaceholder: z.string().max(120).optional(),
      notFoundBody: z.string().max(200).optional(),
      searched: z.string().max(60).optional(),
      viewerLink: z.string().max(40).optional(),
      sourceDomain: z.string().max(80).optional(),
      license: z.object({ name: z.string().min(1).max(80), url: z.url() }).optional(),
      promptSubject: z.string().min(1).max(60).optional(),
      rerankSubject: z.string().min(1).max(60).optional(),
      suggested: z
        .array(
          z.object({
            id: z.string().regex(/^[a-z0-9-]{1,20}$/),
            text: z.string().min(3).max(200),
            topic: z.string().min(1).max(24).optional(),
          }),
        )
        .max(6)
        .default([]),
    })
    .prefault({}),
  overrides: z
    .object({
      // section 29.2
      chunking: z
        .object({
          minTokens: z.number().int(),
          targetTokens: z.number().int(),
          maxTokens: z.number().int(),
          overlapTokens: z.number().int(),
        })
        .partial()
        .default({}),
      retrieval: z
        .object({
          vectorCandidates: z.number().int(),
          ftsCandidates: z.number().int(),
          rerankCandidates: z.number().int(),
          finalPassages: z.number().int().min(1).max(9),
        })
        .partial()
        .default({}),
      contextualEmbedding: z.boolean().default(true),
    })
    .prefault({}),
});
export const KitConfigSchema = BaseKitConfigSchema.superRefine(validateKitConfig); // cross-field rules, section 29.3

export type KitConfig = z.infer<typeof KitConfigSchema>;
export const defineConfig = (config: z.input<typeof KitConfigSchema>) => config;

export function validateKitConfig(
  config: z.infer<typeof BaseKitConfigSchema>,
  ctx: z.RefinementCtx,
): void {
  const issue = (path: (string | number)[], message: string) => {
    ctx.addIssue({ code: 'custom', path, message });
  };
  const embed = config.models.embed;
  if (embed.provider === 'openai' || embed.provider === 'gemini') {
    const allowed = modelCapabilities(embed.provider, embed.model).embedDimensions;
    if (!allowed?.includes(embed.dimensions))
      issue(
        ['models', 'embed', 'dimensions'],
        'Choose a supported embedding model and one of its documented dimensions.',
      );
  }
  const ids = new Set<string>();
  config.sources.forEach((source, index) => {
    if (ids.has(source.id)) issue(['sources', index, 'id'], 'Use a unique source id.');
    ids.add(source.id);
  });
  const c = config.overrides.chunking;
  const min = c.minTokens ?? CHUNKING.MIN_TOKENS;
  const target = c.targetTokens ?? CHUNKING.TARGET_TOKENS;
  const max = c.maxTokens ?? CHUNKING.MAX_TOKENS;
  const overlap = c.overlapTokens ?? CHUNKING.OVERLAP_TOKENS;
  if (!(200 <= min && min < target && target < max && max <= 1500))
    issue(['overrides', 'chunking'], 'Set 200 ≤ minTokens < targetTokens < maxTokens ≤ 1500.');
  if (overlap > min / 4)
    issue(['overrides', 'chunking', 'overlapTokens'], 'Set overlapTokens ≤ minTokens / 4.');
  const r = config.overrides.retrieval;
  const vector = r.vectorCandidates ?? RETRIEVAL.VECTOR_CANDIDATES;
  const fts = r.ftsCandidates ?? RETRIEVAL.FTS_CANDIDATES;
  const final = r.finalPassages ?? RETRIEVAL.FINAL_PASSAGES;
  const rerank = r.rerankCandidates ?? RETRIEVAL.RERANK_CANDIDATES;
  for (const [field, value] of [
    ['vectorCandidates', vector],
    ['ftsCandidates', fts],
  ] as const) {
    if (value < 10 || value > 200)
      issue(['overrides', 'retrieval', field], 'Choose a value between 10 and 200.');
  }
  if (rerank < final || rerank > Math.min(vector + fts, 50))
    issue(
      ['overrides', 'retrieval', 'rerankCandidates'],
      'Set finalPassages ≤ rerankCandidates ≤ min(vectorCandidates + ftsCandidates, 50).',
    );
  if (config.profile === 'public-demo') {
    if (config.copy.suggested.length === 0)
      issue(['copy', 'suggested'], 'Provide 1–6 suggested questions for public-demo.');
    for (const role of ['chat', 'rerank', 'judge', 'generate', 'embed'] as const) {
      const model = config.models[role] ?? config.models.chat;
      const key = `${model.provider}:${model.model}`;
      if (!config.pricing[key])
        issue(['pricing', key], `Add inputPerMTok and outputPerMTok pricing for ${role}.`);
    }
  }
  const env = getConfigEnv();
  if (env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production') {
    for (const [role, model] of Object.entries(config.models)) {
      if (model?.provider === 'mock')
        issue(
          ['models', role, 'provider'],
          'Choose a real provider; mock is forbidden in production.',
        );
    }
  }
}
