import { z } from 'zod';
import { readConfig } from '@/lib/setup/config';
import { setupRoute } from '@/lib/setup/http';
import { estimateSummary } from '@/lib/setup/ingest-job';
import { ModelId, withEmbedding } from '@/lib/setup/models';

export const runtime = 'nodejs';
export const maxDuration = 300;
const Body = z.strictObject({ embed: ModelId });

/** What a new embedding model costs: a dry run of the full rebuild; nothing is saved. */
export function POST(request: Request): Promise<Response> {
  return setupRoute(request, async ({ body }) => {
    const candidate = withEmbedding(readConfig(), Body.parse(body).embed);
    return Response.json(await estimateSummary({ config: candidate, rebuild: true }));
  });
}
