import 'server-only';
import { z } from 'zod';
import { AppError } from '@/lib/errors';

export type EnvironmentIssue = { name: string; fix: string };
const environmentFixes: Record<string, string> = {
  DATABASE_URL: 'Set DATABASE_URL to a valid database connection URL in .env.local.',
  QUESTION_HASH_SALT:
    'Set QUESTION_HASH_SALT to a random value of at least 32 characters in .env.local.',
  IP_HASH_SALT: 'Set IP_HASH_SALT to a random value of at least 32 characters in .env.local.',
  SOURCED_ACCESS_TOKEN:
    'Set SOURCED_ACCESS_TOKEN to a random value of at least 24 characters in .env.local.',
  NEXT_PUBLIC_SITE_URL: 'Set NEXT_PUBLIC_SITE_URL to the app URL in .env.local.',
  LLM_MODE: 'Set LLM_MODE to live or mock; use live in production.',
};
export class EnvironmentError extends AppError {
  readonly issues: EnvironmentIssue[];
  constructor(names: string[]) {
    const issues = [...new Set(names)].map((name) => ({
      name,
      fix:
        environmentFixes[name] ??
        (/API_KEY$/.test(name)
          ? `Set ${name} to your provider key in .env.local.`
          : `Set ${name} to a valid value using .env.example, then retry.`),
    }));
    super('CONFIG_INVALID', issues.map(({ name, fix }) => `${name}: ${fix}`).join('\n'));
    this.issues = issues;
  }
}
function invalidEnvironment(error: z.ZodError): EnvironmentError {
  return new EnvironmentError(error.issues.map((issue) => String(issue.path[0] ?? 'environment')));
}

// CSP construction must still run when unrelated runtime settings are invalid.
export function getMiddlewareEnv() {
  return z
    .object({
      NODE_ENV: z.string().optional(),
      VERCEL_ENV: z.string().optional(),
      SOURCED_ACCESS_TOKEN: z.string().optional(),
    })
    .parse(process.env);
}

// Defined by next.config.ts; CLI/tests use Node's current on-disk snapshot.
declare const SOURCED_NODE_RUNTIME: boolean;
const providerConfigSchema = z.object({
  config: z.object({
    profile: z.enum(['local', 'private', 'public-demo']),
    models: z.record(
      z.string(),
      z.object({
        provider: z.enum(['openai', 'gemini', 'anthropic', 'ollama', 'mock']),
      }),
    ),
  }),
});
function providerConfig() {
  // No generated imports: snapshot creation itself imports this module.
  // Edge and fresh clones retain the example's strict live-mode requirements.
  if (typeof SOURCED_NODE_RUNTIME !== 'undefined' && !SOURCED_NODE_RUNTIME) return;
  if (typeof process.getBuiltinModule !== 'function') return;
  let value: unknown;
  try {
    value = JSON.parse(process.getBuiltinModule('fs').readFileSync('.sourced/config.json', 'utf8'));
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT')
      return;
    throw error;
  }
  return providerConfigSchema.parse(value).config;
}

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
  GOOGLE_GENERATIVE_AI_API_KEY: optionalText,
  ANTHROPIC_API_KEY: optionalText,
  OLLAMA_BASE_URL: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.url().default('http://localhost:11434'),
  ),
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
  IP_HASH_SALT: z.string().default(''),
  SOURCED_ACCESS_TOKEN: optionalText,
  QUESTION_HASH_SALT: z.string().min(32),
  STORE_QUESTIONS: flag('false'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  NEXT_PUBLIC_SITE_URL: z.url(),
  ALLOWED_ORIGINS: z.string().default(''),
  INGEST_INCLUDE_FIXTURES: flag('false'),
  INGEST_CONFIRM_ABOVE_USD: z.coerce.number().nonnegative().default(1),
  EVAL_MAX_COST_USD: z.coerce.number().positive().default(1),
  EVAL_RESULTS_DIR: z.string().default('eval/postgres-17/results'),
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

// Configuration loading needs deployment guards and optional overrides, not runtime
// credentials. Keep this separate from getEnv(), whose full validation stays strict.
const optionalPrice = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.coerce.number().nonnegative().optional(),
);
const configEnvSchema = schema
  .pick({
    NODE_ENV: true,
    VERCEL_ENV: true,
    LLM_MODE: true,
    CHAT_MODEL: true,
    JUDGE_MODEL: true,
  })
  .extend({
    PRICE_CHAT_INPUT_PER_MTOK: optionalPrice,
    PRICE_CHAT_OUTPUT_PER_MTOK: optionalPrice,
    PRICE_JUDGE_INPUT_PER_MTOK: optionalPrice,
    PRICE_JUDGE_OUTPUT_PER_MTOK: optionalPrice,
    PRICE_EMBED_PER_MTOK: optionalPrice,
  })
  .superRefine((env, ctx) => {
    if (env.LLM_MODE === 'mock' && env.VERCEL_ENV === 'production')
      ctx.addIssue({ code: 'custom', path: ['LLM_MODE'], message: 'Mock forbidden in production' });
  });

export function getConfigEnv(): z.infer<typeof configEnvSchema> {
  const result = configEnvSchema.safeParse(process.env);
  if (!result.success) throw invalidEnvironment(result.error);
  return result.data;
}

type Env = z.infer<typeof schema>;
let cached: Env | undefined;

export function getEnv(): Env {
  if (cached) return cached;
  const result = schema
    .superRefine((env, ctx) => {
      const config = providerConfig();
      if ((!config || config.profile === 'public-demo') && env.IP_HASH_SALT.length < 32)
        ctx.addIssue({
          code: 'custom',
          path: ['IP_HASH_SALT'],
          message: 'At least 32 characters required for public-demo',
        });
      if (config?.profile === 'private' && (env.SOURCED_ACCESS_TOKEN?.length ?? 0) < 24)
        ctx.addIssue({
          code: 'custom',
          path: ['SOURCED_ACCESS_TOKEN'],
          message: 'At least 24 characters required for private',
        });
      if (env.LLM_MODE === 'live') {
        const keys = new Set<string>(config ? [] : ['OPENAI_API_KEY']);
        for (const model of Object.values(config?.models ?? {})) {
          if (model.provider === 'openai') keys.add('OPENAI_API_KEY');
          if (model.provider === 'gemini') keys.add('GOOGLE_GENERATIVE_AI_API_KEY');
          if (model.provider === 'anthropic') keys.add('ANTHROPIC_API_KEY');
        }
        if (!config || config.profile === 'public-demo')
          for (const key of [
            'CHAT_MODEL',
            'PRICE_CHAT_INPUT_PER_MTOK',
            'PRICE_CHAT_OUTPUT_PER_MTOK',
            'PRICE_EMBED_PER_MTOK',
          ] as const)
            keys.add(key);
        for (const key of keys) {
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
    throw invalidEnvironment(result.error);
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

/** CLI output boundary only: usable even when runtime environment validation fails. */
export function getCliSecrets(): string[] {
  return (
    Object.entries(process.env)
      .filter(([name]) => /KEY|TOKEN|PASSWORD|SECRET|SALT|DATABASE_URL/.test(name))
      // Keep full values only. URL credentials are redacted in URL context, never
      // promoted to bare substrings that could corrupt ordinary CLI instructions.
      .flatMap(([, value]) => (value ? [value] : []))
  );
}

/** Diagnostic/bootstrap boundary: inspect names even before runtime settings are complete. */
export function getCliEnvironment() {
  const result = z
    .object({
      DATABASE_URL: optionalText,
      MIGRATION_DATABASE_URL: optionalText,
      OPENAI_API_KEY: optionalText,
      GOOGLE_GENERATIVE_AI_API_KEY: optionalText,
      ANTHROPIC_API_KEY: optionalText,
      SOURCED_ACCESS_TOKEN: optionalText,
      QUESTION_HASH_SALT: optionalText,
      IP_HASH_SALT: optionalText,
      NEXT_PUBLIC_SITE_URL: optionalText,
      RATE_LIMIT_IP_DAILY: optionalText,
      RATE_LIMIT_GLOBAL_DAILY: optionalText,
      DEMO_MODE: optionalText,
      CHAT_MODEL: optionalText,
      PRICE_CHAT_INPUT_PER_MTOK: optionalText,
      PRICE_CHAT_OUTPUT_PER_MTOK: optionalText,
      PRICE_EMBED_PER_MTOK: optionalText,
      LLM_MODE: z.enum(['live', 'mock']).default('live'),
      OLLAMA_BASE_URL: optionalText,
      SOURCED_DOCKER: optionalText,
      SOURCED_PORT: optionalText,
      SOURCED_DB_PORT: optionalText,
    })
    .safeParse(process.env);
  if (!result.success) throw invalidEnvironment(result.error);
  return result.data;
}
