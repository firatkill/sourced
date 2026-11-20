import 'server-only';
// T-89 / R2 §6 (security 4): the key check is the one provider call made before an
// explicit confirm. It reuses `checkProviderKeys`, whose list-models request is free.
import { checkProviderKeys, type DiagnosticEnvironment } from '@/lib/cli/commands/provider-checks';
import { getCliEnvironment } from '@/lib/env';
import type { KitConfig } from '@/lib/kit/config-schema';
import type { EditableEnv } from './env-file';

export const KEYED_PROVIDERS = {
  openai: { env: 'OPENAI_API_KEY', label: 'OpenAI' },
  anthropic: { env: 'ANTHROPIC_API_KEY', label: 'Anthropic' },
  gemini: { env: 'GOOGLE_GENERATIVE_AI_API_KEY', label: 'Google Gemini' },
} as const satisfies Record<string, { env: EditableEnv; label: string }>;
export type KeyedProvider = keyof typeof KEYED_PROVIDERS;

export type KeyCheck = { ok: true } | { ok: false; reason: 'rejected' | 'unreachable' };

export async function checkKey(
  provider: KeyedProvider,
  key: string,
  fetcher: typeof fetch = fetch,
): Promise<KeyCheck> {
  const env: DiagnosticEnvironment = {
    ...getCliEnvironment(),
    [KEYED_PROVIDERS[provider].env]: key,
  };
  const config = { models: { chat: { provider, model: 'key-check' } } } as unknown as KitConfig;
  try {
    await checkProviderKeys(config, env, false, fetcher);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error && error.message === 'Provider authentication failed.'
          ? 'rejected'
          : 'unreachable',
    };
  }
}
