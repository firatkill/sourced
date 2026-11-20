import { z } from 'zod';
import { setupRoute } from '@/lib/setup/http';
import { estimateSummary } from '@/lib/setup/ingest-job';

export const runtime = 'nodejs';
export const maxDuration = 300;
const Body = z.strictObject({ rebuild: z.boolean().optional() });

/** The cost confirm's numbers: a dry run, so nothing goes to a provider (R2 §6, security 4). */
export function POST(request: Request): Promise<Response> {
  return setupRoute(request, async ({ body }) => {
    const { rebuild } = Body.parse(body ?? {});
    return Response.json(await estimateSummary({ rebuild: rebuild === true }));
  });
}
