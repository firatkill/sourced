import { z } from 'zod';
import { getEnv } from '@/lib/env';
import { setupRoute } from '@/lib/setup/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Is Ollama running at OLLAMA_BASE_URL, and which models has it pulled? A local call only. */
export function GET(request: Request): Promise<Response> {
  return setupRoute(request, async () => {
    const baseUrl = getEnv().OLLAMA_BASE_URL;
    try {
      const response = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(2_000) });
      if (!response.ok) throw new Error('Ollama answered with an error.');
      const body = z
        .object({ models: z.array(z.object({ name: z.string() })) })
        .parse(await response.json());
      return Response.json({ baseUrl, running: true, models: body.models.map((m) => m.name) });
    } catch {
      return Response.json({ baseUrl, running: false, models: [] });
    }
  });
}
