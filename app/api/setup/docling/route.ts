import { z } from 'zod';
import { setupError, setupRoute } from '@/lib/setup/http';
import { doclingInfo, setDoclingEngine } from '@/lib/setup/docling';
import { currentJob } from '@/lib/setup/ingest-job';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const Body = z.strictObject({ engine: z.enum(['builtin', 'docling']) });

/** D-152: which reader the next indexing run uses, and whether Docling is running. */
export function GET(request: Request): Promise<Response> {
  return setupRoute(request, async () =>
    Response.json(await doclingInfo(), { headers: { 'Cache-Control': 'no-store' } }),
  );
}

export function POST(request: Request): Promise<Response> {
  return setupRoute(request, async ({ body, requestId }) => {
    const { engine } = Body.parse(body);
    const running = currentJob();
    if (running && (running.status === 'preparing' || running.status === 'running'))
      return setupError(
        'VALIDATION_FAILED',
        409,
        requestId,
        'Indexing is already running. Change how files are read when it has finished.',
      );
    return Response.json(await setDoclingEngine(engine));
  });
}
