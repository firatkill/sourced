import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSql } from '@/lib/db/client';
import { resetEnvForTests } from '@/lib/env';
import { hashVisitor } from '@/lib/ratelimit/ip';
import { consume, refund } from '@/lib/ratelimit/limiter';

const now = new Date('2026-11-09T23:59:59Z');
const day = '2026-11-09';
const visitor = (ip = '192.0.2.1', date = now) =>
  hashVisitor(new Headers({ 'x-real-ip': ip }), date);
async function counts(date = day) {
  return getSql()<{ bucket: string; count: number }[]>`
    SELECT bucket, count FROM rate_limits WHERE window_start = ${date}::date ORDER BY bucket`;
}
beforeEach(async () => {
  vi.stubEnv('RATE_LIMIT_IP_DAILY', '10');
  vi.stubEnv('RATE_LIMIT_GLOBAL_DAILY', '300');
  resetEnvForTests();
  await getSql()`TRUNCATE rate_limits`;
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
  resetEnvForTests();
});

describe('IT-06: daily quotas and refund (FR-26, FR-27, FR-32)', () => {
  it('TC-072: admits N, rejects N+1 with IP scope without incrementing global', async () => {
    const hash = visitor();
    for (let i = 0; i < 10; i++) expect(await consume(hash, now)).toEqual({ ok: true, day });
    expect(await consume(hash, now)).toEqual({
      ok: false,
      scope: 'ip',
      resetAt: new Date('2026-11-10T00:00:00Z'),
    });
    expect(await counts()).toEqual([
      { bucket: 'global', count: 10 },
      { bucket: 'ip:' + hash, count: 10 },
    ]);
  });

  it('TC-072: global cap rolls back both existing and newly inserted visitor increments', async () => {
    vi.stubEnv('RATE_LIMIT_GLOBAL_DAILY', '2');
    resetEnvForTests();
    const hash = visitor();
    await consume(hash, now);
    await consume(hash, now);
    for (const candidate of [hash, visitor('192.0.2.2')]) {
      expect(await consume(candidate, now)).toEqual({
        ok: false,
        scope: 'global',
        resetAt: new Date('2026-11-10T00:00:00Z'),
      });
    }
    expect(await counts()).toEqual([
      { bucket: 'global', count: 2 },
      { bucket: 'ip:' + hash, count: 2 },
    ]);
  });

  it.each(['ip', 'global'] as const)(
    'TC-072: 50 concurrent requests at %s limit 10 admit exactly 10',
    async (scope) => {
      vi.stubEnv('RATE_LIMIT_GLOBAL_DAILY', scope === 'global' ? '10' : '300');
      resetEnvForTests();
      const results = await Promise.all(
        Array.from({ length: 50 }, (_, i) =>
          consume(visitor(scope === 'ip' ? '192.0.2.1' : `192.0.2.${String(i + 1)}`), now),
        ),
      );
      expect(results.filter((result) => result.ok)).toHaveLength(10);
      expect(results.filter((result) => !result.ok && result.scope === scope)).toHaveLength(40);
      const rows = await counts();
      expect(rows.find((row) => row.bucket === 'global')?.count).toBe(10);
      expect(
        rows.filter((row) => row.bucket !== 'global').reduce((sum, row) => sum + row.count, 0),
      ).toBe(10);
    },
  );

  it('TC-072: injected UTC clock opens a fresh window and uses the current clock by default', async () => {
    vi.stubEnv('RATE_LIMIT_IP_DAILY', '1');
    resetEnvForTests();
    const hash = visitor();
    expect((await consume(hash, now)).ok).toBe(true);
    expect((await consume(hash, now)).ok).toBe(false);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-10T00:00:00Z'));
    expect(await consume(hash)).toEqual({ ok: true, day: '2026-11-10' });
    expect((await counts())[0]?.count).toBe(1);
    expect((await counts('2026-11-10'))[0]?.count).toBe(1);
  });

  it('TC-073: one refund decrements both counters exactly once in the original window, without affecting another visitor', async () => {
    const hash = visitor();
    const other = visitor('192.0.2.2');
    const receipt = await consume(hash, now);
    expect(receipt.ok).toBe(true);
    if (!receipt.ok) throw new Error('Expected consumption');
    await consume(hash, now);
    await consume(other, now);
    const tomorrow = new Date('2026-11-10T00:00:00Z');
    await consume(hash, tomorrow);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(tomorrow);
    await refund(hash, receipt.day);
    const rows = await counts();
    expect(rows.find((row) => row.bucket === 'global')?.count).toBe(2);
    expect(rows.find((row) => row.bucket === 'ip:' + hash)?.count).toBe(1);
    expect(rows.find((row) => row.bucket === 'ip:' + other)?.count).toBe(1);
    expect((await counts('2026-11-10')).map((row) => row.count)).toEqual([1, 1]);
  });

  it('TC-073: normative refund SQL never makes counters negative', async () => {
    const hash = visitor();
    await refund(hash, day);
    expect(await counts()).toHaveLength(0);
    await consume(hash, now);
    await refund(hash, day);
    expect((await counts()).map((row) => row.count)).toEqual([0, 0]);
    await refund(hash, day);
    expect((await counts()).map((row) => row.count)).toEqual([0, 0]);
  });

  it('TC-071/TC-072: raw IPs never reach stored buckets, results, errors or logs (NFR-12)', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const ip = '192.0.2.99';
    const hash = visitor(ip);
    const result = await consume(hash, now);
    // A database failure must roll back the first increment and propagate (normative catch).
    vi.stubEnv('RATE_LIMIT_GLOBAL_DAILY', '2147483648');
    resetEnvForTests();
    let failure: unknown;
    try {
      await consume(hash, now);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect((await counts()).map((row) => row.count)).toEqual([1, 1]);
    expect(
      JSON.stringify([
        result,
        String(failure),
        await counts(),
        stdout.mock.calls,
        stderr.mock.calls,
      ]),
    ).not.toContain(ip);
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).not.toHaveBeenCalled();
  });
});
