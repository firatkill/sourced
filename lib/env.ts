import 'server-only';
import { z } from 'zod';

const positiveInt = z.coerce.number().int().positive();
const price = z.coerce.number().nonnegative().default(0);
const optionalText = z.preprocess((v) => (v === '' ? undefined : v), z.string().optional());
const flag = (fallback: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(fallback)
    .transform((v) => v === 'true');
const schema = z.object({
  DATABASE_URL: z.url(),
  MIGRATION_DATABASE_URL: optionalText,
  TEST_DATABASE_URL: optionalText,
  DATABASE_POOL_MAX: positiveInt.default(5),
  LLM_MODE: z.enum(['live', 'mock']).default('live'),
  LLM_PROVIDER: z.literal('openai').default('openai'),
  OPENAI_API_KEY: optionalText,
  CHAT_MODEL: optionalText,
  JUDGE_MODEL: optionalText,
  MAX_OUTPUT_TOKENS: z.coerce.number().int().min(200).max(2000).default(700),
  PRICE_CHAT_INPUT_PER_MTOK: price,
  PRICE_CHAT_OUTPUT_PER_MTOK: price,
  PRICE_EMBED_PER_MTOK: price,
  PRICE_JUDGE_INPUT_PER_MTOK: price,
  PRICE_JUDGE_OUTPUT_PER_MTOK: price,
  DEMO_MODE: z.enum(['on', 'readonly', 'off']).default('on'),
  RATE_LIMIT_IP_DAILY: positiveInt.default(10),
  RATE_LIMIT_GLOBAL_DAILY: positiveInt.default(300),
  IP_HASH_SALT: z.string().min(32),
  QUESTION_HASH_SALT: z.string().min(32),
  STORE_QUESTIONS: flag('false'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  NEXT_PUBLIC_SITE_URL: z.url(),
  ALLOWED_ORIGINS: z.string().default(''),
  INGEST_INCLUDE_FIXTURES: flag('false'),
  EVAL_MAX_COST_USD: z.coerce.number().positive().default(1),
  EVAL_RESULTS_DIR: z.string().default('eval/results'),
  MOCK_STREAM_DELAY_MS: z.coerce.number().int().nonnegative().default(10),
  VERCEL_ENV: optionalText,
  VERCEL_URL: optionalText,
  VERCEL_BRANCH_URL: optionalText,
  VERCEL_PROJECT_PRODUCTION_URL: optionalText,
  VERCEL_GIT_COMMIT_SHA: optionalText,
  VERCEL: optionalText,
  NODE_ENV: optionalText,
  GITHUB_STEP_SUMMARY: optionalText,
});

type Env = z.infer<typeof schema>;
let cached: Env | undefined;

export function getEnv(): Env {
  if (cached) return cached;
  const result = schema
    .superRefine((env, ctx) => {
      if (env.LLM_MODE === 'live') {
        for (const key of [
          'OPENAI_API_KEY',
          'CHAT_MODEL',
          'PRICE_CHAT_INPUT_PER_MTOK',
          'PRICE_CHAT_OUTPUT_PER_MTOK',
          'PRICE_EMBED_PER_MTOK',
        ] as const) {
          if (!process.env[key]?.trim())
            ctx.addIssue({ code: 'custom', path: [key], message: 'Required in live mode' });
        }
      }
      if (env.LLM_MODE === 'mock' && env.VERCEL_ENV === 'production') {
        ctx.addIssue({
          code: 'custom',
          path: ['LLM_MODE'],
          message: 'Mock forbidden in production',
        });
      }
    })
    .safeParse(process.env);
  if (!result.success) {
    throw new Error(
      `Invalid environment variables: ${[...new Set(result.error.issues.map((issue) => issue.path.join('.')))].join(', ')}`,
    );
  }
  cached =
    result.data.LLM_MODE === 'mock'
      ? { ...result.data, CHAT_MODEL: 'mock', JUDGE_MODEL: 'mock' }
      : result.data;
  return cached;
}

/** Tests only: invalidate memoized environment after changing test variables. */
export function resetEnvForTests(): void {
  cached = undefined;
}
