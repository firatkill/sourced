import { z } from 'zod';
import { readConfig, writeConfig } from '@/lib/setup/config';
import { setupRoute } from '@/lib/setup/http';
import { ModelId, modelOptions, withModels } from '@/lib/setup/models';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const Body = z
  .strictObject({ chat: ModelId.optional(), judge: ModelId.optional() })
  .refine((body) => body.chat ?? body.judge);

export function GET(request: Request): Promise<Response> {
  return setupRoute(request, () =>
    Promise.resolve(
      Response.json(modelOptions(readConfig()), { headers: { 'Cache-Control': 'no-store' } }),
    ),
  );
}

/** Answer and quality-check models take effect on the next request; no restart. */
export function PATCH(request: Request): Promise<Response> {
  return setupRoute(request, async ({ body }) => {
    const change = Body.parse(body);
    const next = withModels(readConfig(), {
      ...(change.chat ? { chat: change.chat } : {}),
      ...(change.judge ? { judge: change.judge } : {}),
    });
    await writeConfig(next);
    return Response.json(modelOptions(next));
  });
}
