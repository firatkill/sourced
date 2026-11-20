import { getSql } from '@/lib/db/client';
import { setupRoute } from '@/lib/setup/http';
import { setupStatus } from '@/lib/setup/status';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request): Promise<Response> {
  return setupRoute(request, async () =>
    Response.json(await setupStatus(getSql()), { headers: { 'Cache-Control': 'no-store' } }),
  );
}
