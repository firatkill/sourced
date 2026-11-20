import { z } from 'zod';
import { jsonError } from '@/lib/http/errors';
import { getLibraryFacts } from '@/lib/library/facts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** REDESIGN-v2 §3.3 / §5: library facts for the header, empty state and Settings › Library. */
const LibraryResponse = z.object({
  documents: z.number().int().nonnegative(),
  sources: z.array(z.string()),
  lastIngestAt: z.iso.datetime().nullable(),
});

export async function GET(request: Request): Promise<Response> {
  try {
    const facts = LibraryResponse.parse(await getLibraryFacts());
    return Response.json(facts, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    // Like /api/health: a database failure exposes no details.
    return jsonError({
      code: 'INTERNAL_ERROR',
      status: 503,
      requestId: request.headers.get('x-request-id') ?? crypto.randomUUID(),
    });
  }
}
