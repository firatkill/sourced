import { z } from 'zod';
import { readConfig, writeConfig } from '@/lib/setup/config';
import { setupError, setupRoute } from '@/lib/setup/http';
import { currentJob } from '@/lib/setup/ingest-job';
import { ModelId, modelOptions, withSetupModels } from '@/lib/setup/models';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const Body = z
  .strictObject({ chat: ModelId.optional(), judge: ModelId.optional(), embed: ModelId.optional() })
  .refine((body) => body.chat ?? body.judge ?? body.embed);

/** Setup's Advanced settings: the models are saved before anything is indexed or sent. */
export function POST(request: Request): Promise<Response> {
  return setupRoute(request, async ({ body, requestId }) => {
    const change = Body.parse(body);
    const running = currentJob();
    if (running && (running.status === 'preparing' || running.status === 'running'))
      return setupError(
        'VALIDATION_FAILED',
        409,
        requestId,
        'Indexing is already running. Change the models when it has finished.',
      );
    const next = withSetupModels(readConfig(), {
      ...(change.chat ? { chat: change.chat } : {}),
      ...(change.judge ? { judge: change.judge } : {}),
      ...(change.embed ? { embed: change.embed } : {}),
    });
    await writeConfig(next);
    return Response.json(modelOptions(next));
  });
}
