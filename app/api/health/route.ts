import { getSql } from '@/lib/db/client';
import { getEnv } from '@/lib/env';
import { HealthResponse } from '@/lib/http/health';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const env = getEnv();
  const sql = getSql();
  const ping = sql`SELECT 1`;
  const counts = sql<{ version: string | null; documents: number; chunks: number }[]>`
    SELECT
      (SELECT corpus_version FROM ingest_runs WHERE status = 'succeeded'
       ORDER BY finished_at DESC LIMIT 1) AS version,
      (SELECT count(*)::integer FROM documents) AS documents,
      (SELECT count(*)::integer FROM chunks) AS chunks`;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let corpus = null;
  try {
    corpus = await Promise.race([
      Promise.all([ping, counts]).then(([, rows]) => rows[0] ?? null),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          resolve(null);
          ping.cancel();
          counts.cancel();
        }, 3_000);
      }),
    ]);
  } catch {
    // Database failures expose only the health contract, never provider details.
  } finally {
    clearTimeout(timer);
  }
  return Response.json(
    HealthResponse.parse({
      status: corpus === null ? 'degraded' : 'ok',
      db: corpus === null ? 'error' : 'ok',
      demoMode: env.DEMO_MODE,
      llmMode: env.LLM_MODE,
      version: env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local',
      corpus,
      time: new Date().toISOString(),
    }),
    {
      status: corpus === null ? 503 : 200,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
