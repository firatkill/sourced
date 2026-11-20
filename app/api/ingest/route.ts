import { z } from 'zod';
import { getSql } from '@/lib/db/client';
import { setupRoute } from '@/lib/setup/http';
import { ingestProgress, startIngest } from '@/lib/setup/ingest-job';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// The person confirmed the estimate in the browser; that is the CLI's `--yes`.
const Body = z.strictObject({ confirm: z.literal(true), rebuild: z.boolean().optional() });

export function POST(request: Request): Promise<Response> {
  return setupRoute(request, ({ body }) => {
    const { rebuild } = Body.parse(body);
    const { job, started } = startIngest({ rebuild: rebuild === true });
    return Promise.resolve(Response.json({ job }, { status: started ? 202 : 200 }));
  });
}

export function GET(request: Request): Promise<Response> {
  return setupRoute(request, async () =>
    Response.json(
      { job: await ingestProgress(getSql()) },
      { headers: { 'Cache-Control': 'no-store' } },
    ),
  );
}
