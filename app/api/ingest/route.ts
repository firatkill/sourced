import { z } from 'zod';
import { getSql } from '@/lib/db/client';
import { setupRoute } from '@/lib/setup/http';
import { ingestProgress, startIngest } from '@/lib/setup/ingest-job';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// The person confirmed the estimate in the browser; that is the CLI's `--yes`.
const Body = z.strictObject({ confirm: z.literal(true), rebuild: z.boolean().optional() });

export function POST(request: Request): Promise<Response> {
  return setupRoute(request, async ({ body }) => {
    const { rebuild } = Body.parse(body);
    const { job, started } = startIngest({ rebuild: rebuild === true });
    // The same shape as GET and the event stream, so the page can render it at once.
    const progress = (await ingestProgress(getSql())) ?? {
      ...job,
      documents: { total: 0, done: 0, failed: 0, skipped: 0 },
    };
    return Response.json({ job: progress }, { status: started ? 202 : 200 });
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
