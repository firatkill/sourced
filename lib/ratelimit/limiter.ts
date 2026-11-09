import 'server-only';
import { getSql } from '@/lib/db/client';
import { getEnv } from '@/lib/env';
import { utcDate, nextUtcMidnight } from '@/lib/time';

class LimitHit extends Error {
  constructor(readonly scope: 'ip' | 'global') {
    super('Daily quota reached.');
  }
}

export async function consume(
  ipHash: string,
  now = new Date(),
): Promise<{ ok: true; day: string } | { ok: false; scope: 'ip' | 'global'; resetAt: Date }> {
  const day = utcDate(now); // 'YYYY-MM-DD'
  const env = getEnv();
  try {
    await getSql().begin(async (tx) => {
      const ip = await tx`
        INSERT INTO rate_limits (bucket, window_start, count)
        VALUES (${'ip:' + ipHash}, ${day}::date, 1)
        ON CONFLICT (bucket, window_start)
        DO UPDATE SET count = rate_limits.count + 1, updated_at = now()
        WHERE rate_limits.count < ${env.RATE_LIMIT_IP_DAILY}
        RETURNING count`;
      if (ip.length === 0) throw new LimitHit('ip');

      const global = await tx`
        INSERT INTO rate_limits (bucket, window_start, count)
        VALUES ('global', ${day}::date, 1)
        ON CONFLICT (bucket, window_start)
        DO UPDATE SET count = rate_limits.count + 1, updated_at = now()
        WHERE rate_limits.count < ${env.RATE_LIMIT_GLOBAL_DAILY}
        RETURNING count`;
      if (global.length === 0) throw new LimitHit('global');
    });
    return { ok: true, day };
  } catch (e) {
    if (e instanceof LimitHit) return { ok: false, scope: e.scope, resetAt: nextUtcMidnight(now) };
    throw e;
  }
}

/** The caller refunds at most once per request, using the original consumption day. */
export async function refund(ipHash: string, day: string): Promise<void> {
  await getSql()`
    UPDATE rate_limits
    SET count = GREATEST(count - 1, 0), updated_at = now()
    WHERE window_start = ${day}::date AND bucket = ANY(${['ip:' + ipHash, 'global']}::text[])`;
}
