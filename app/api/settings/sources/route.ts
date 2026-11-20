import { z } from 'zod';
import { removeSource } from '@/lib/setup/documents';
import { setupRoute } from '@/lib/setup/http';

export const runtime = 'nodejs';

/** T-92: removes a source and its indexed documents. Files on disk are not touched. */
export function DELETE(request: Request): Promise<Response> {
  return setupRoute(request, async () => {
    const id = z.string().min(1).max(80).parse(new URL(request.url).searchParams.get('id'));
    return Response.json(await removeSource(id));
  });
}
