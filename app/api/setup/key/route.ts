import { z } from 'zod';
import { maskKey, validEnvValue, writeEnvValues } from '@/lib/setup/env-file';
import { setupError, setupRoute } from '@/lib/setup/http';
import { checkKey, KEYED_PROVIDERS, type KeyedProvider } from '@/lib/setup/keys';

export const runtime = 'nodejs';
const Body = z.strictObject({
  provider: z.enum(Object.keys(KEYED_PROVIDERS) as [KeyedProvider, ...KeyedProvider[]]),
  key: z.string().trim().min(8).max(512).refine(validEnvValue),
});

/**
 * Checks a key with the provider's free list-models call, then saves it to `.env.local`
 * and the running server. The response carries only the masked key.
 */
export function POST(request: Request): Promise<Response> {
  return setupRoute(request, async ({ body, requestId }) => {
    const { provider, key } = Body.parse(body);
    const { label, env } = KEYED_PROVIDERS[provider];
    const check = await checkKey(provider, key);
    if (!check.ok)
      return check.reason === 'rejected'
        ? setupError('VALIDATION_FAILED', 400, requestId, `${label} did not accept this key.`, {
            field: 'key',
            reason: 'rejected',
          })
        : setupError(
            'PROVIDER_ERROR',
            502,
            requestId,
            `Could not reach ${label}. Check your connection and try again.`,
          );
    await writeEnvValues({ [env]: key });
    return Response.json({ provider, masked: maskKey(key) });
  });
}

export function DELETE(request: Request): Promise<Response> {
  return setupRoute(request, async () => {
    const provider = z
      .enum(Object.keys(KEYED_PROVIDERS) as [KeyedProvider, ...KeyedProvider[]])
      .parse(new URL(request.url).searchParams.get('provider'));
    await writeEnvValues({ [KEYED_PROVIDERS[provider].env]: null });
    return Response.json({ provider, masked: null });
  });
}
