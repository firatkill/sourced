import { z } from 'zod';
import { chooseData } from '@/lib/setup/documents';
import { setupRoute } from '@/lib/setup/http';

export const runtime = 'nodejs';
const Body = z.strictObject({ choice: z.enum(['example', 'own']) });

/** Setup step 1: keep the example, or remove it (`reset`; saved chats are kept). */
export function POST(request: Request): Promise<Response> {
  return setupRoute(request, async ({ body }) =>
    Response.json(await chooseData(Body.parse(body).choice)),
  );
}
