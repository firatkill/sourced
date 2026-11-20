import { z } from 'zod';
import { setupError, setupRoute } from '@/lib/setup/http';
import { currentJob } from '@/lib/setup/ingest-job';
import { resetData } from '@/lib/setup/reset';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const Body = z.strictObject({ scope: z.enum(['library', 'everything']) });

/** D-153: resets the library (chats stay) or everything (chats and projects too). */
export function POST(request: Request): Promise<Response> {
  return setupRoute(request, async ({ body, requestId }) => {
    const { scope } = Body.parse(body);
    const running = currentJob();
    if (running && (running.status === 'preparing' || running.status === 'running'))
      return setupError(
        'VALIDATION_FAILED',
        409,
        requestId,
        'Indexing is running. Reset when it has finished.',
      );
    return Response.json(await resetData({ chats: scope === 'everything' }));
  });
}
