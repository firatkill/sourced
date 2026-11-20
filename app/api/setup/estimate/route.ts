import { z } from 'zod';
import { getEnv } from '@/lib/env';
import { setupRoute } from '@/lib/setup/http';
import { estimateIngest } from '@/lib/setup/ingest-job';
import { readConfig } from '@/lib/setup/config';

export const runtime = 'nodejs';
export const maxDuration = 300;
const Body = z.strictObject({ rebuild: z.boolean().optional() });

/** The cost confirm's numbers: a dry run, so nothing goes to a provider (R2 §6, security 4). */
export function POST(request: Request): Promise<Response> {
  return setupRoute(request, async ({ body }) => {
    const { rebuild } = Body.parse(body ?? {});
    const result = (await estimateIngest({ rebuild: rebuild === true })) as {
      totals: {
        documents: { discovered: number; skipped: number };
        embeddingTokens: number;
        estimatedCostUsd: number | null;
      };
      warnings?: { code: string }[];
    };
    const embed = readConfig().models.embed;
    return Response.json({
      documents: result.totals.documents.discovered,
      skipped: result.totals.documents.skipped,
      embeddingTokens: result.totals.embeddingTokens,
      estimatedCostUsd: result.totals.estimatedCostUsd,
      provider: embed.provider,
      model: embed.model,
      rebuildRequired: (result.warnings ?? []).some((w) => w.code === 'CORPUS_MISMATCH'),
      confirmAboveUsd: getEnv().INGEST_CONFIRM_ABOVE_USD,
    });
  });
}
