import { z } from 'zod';
import { addUrl } from '@/lib/setup/documents';
import { setupRoute } from '@/lib/setup/http';

export const runtime = 'nodejs';
const Body = z.strictObject({ url: z.url({ protocol: /^https?$/ }).max(2048) });

export function POST(request: Request): Promise<Response> {
  return setupRoute(request, async ({ body }) => Response.json(await addUrl(Body.parse(body).url)));
}
