import { z } from 'zod';
import { getSql } from '@/lib/db/client';
import { readConfig, writeConfig } from '@/lib/setup/config';
import { setupError, setupRoute } from '@/lib/setup/http';
import { currentJob, ingestProgress, startIngest } from '@/lib/setup/ingest-job';
import { ModelId, withEmbedding } from '@/lib/setup/models';

export const runtime = 'nodejs';
const Body = z.strictObject({ embed: ModelId, confirm: z.literal(true) });

/** Saves the new embedding model and rebuilds the index (the person confirmed the estimate). */
export function POST(request: Request): Promise<Response> {
  return setupRoute(request, async ({ body, requestId }) => {
    const { embed } = Body.parse(body);
    const running = currentJob();
    if (running && (running.status === 'preparing' || running.status === 'running'))
      return setupError(
        'VALIDATION_FAILED',
        409,
        requestId,
        'Indexing is already running. Change the model when it has finished.',
      );
    await writeConfig(withEmbedding(readConfig(), embed));
    const { job } = startIngest({ rebuild: true });
    const progress = (await ingestProgress(getSql())) ?? {
      ...job,
      documents: { total: 0, done: 0, failed: 0, skipped: 0 },
    };
    return Response.json({ job: progress }, { status: 202 });
  });
}
