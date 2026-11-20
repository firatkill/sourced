import { getSql } from '@/lib/db/client';
import { setupError, setupRoute } from '@/lib/setup/http';
import { ingestProgress } from '@/lib/setup/ingest-job';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const INTERVAL_MS = 1_000;

/**
 * SSE progress for one browser-started run (`id` is the job id from POST /api/ingest).
 * Closing the stream does not stop the run; reopening resumes from the database.
 */
export function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return setupRoute(request, async ({ requestId }) => {
    const { id } = await context.params;
    const first = await ingestProgress(getSql());
    if (!first || first.id !== id) return setupError('NOT_FOUND', 404, requestId, 'Not found');
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let progress = first;
        for (;;) {
          controller.enqueue(
            encoder.encode(`event: progress\ndata: ${JSON.stringify(progress)}\n\n`),
          );
          if (
            progress.status === 'succeeded' ||
            progress.status === 'failed' ||
            request.signal.aborted
          )
            break;
          await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
          const next = await ingestProgress(getSql());
          if (!next || next.id !== id) break;
          progress = next;
        }
        controller.close();
      },
    });
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
        'X-Accel-Buffering': 'no',
      },
    });
  });
}
