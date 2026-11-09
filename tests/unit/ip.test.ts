import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashVisitor } from '@/lib/ratelimit/ip';
import { resetEnvForTests } from '@/lib/env';

const salt = 'test-only-visitor-salt-0000000000000000';
const now = new Date('2026-11-09T23:59:59Z');
const expected = (ip: string) =>
  createHmac('sha256', salt)
    .update('2026-11-09:' + ip)
    .digest('hex');
beforeEach(() => {
  vi.stubEnv('IP_HASH_SALT', salt);
  resetEnvForTests();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
  resetEnvForTests();
});

describe('UT-15 / TC-071: FR-28, D-10 visitor hashing', () => {
  it.each([
    [{ 'x-real-ip': '192.0.2.1, 192.0.2.2', 'x-forwarded-for': '192.0.2.3' }, '192.0.2.1'],
    [{ 'x-forwarded-for': ' 192.0.2.3 , 192.0.2.4' }, '192.0.2.3'],
    [{ 'x-real-ip': ' FE80::ABCD%eth0 ' }, 'fe80::abcd'],
    [{ 'x-forwarded-for': '2001:DB8::ABCD, 192.0.2.1' }, '2001:db8::abcd'],
    [{}, 'unknown'],
  ])('normalizes headers and hashes the normative date:IP input (%j)', (headers, ip) => {
    expect(hashVisitor(new Headers(headers), now)).toBe(expected(ip));
  });

  it('rotates with UTC date and salt, stays stable within a day, and defaults to the current clock', () => {
    const headers = new Headers({ 'x-real-ip': '192.0.2.1' });
    const first = hashVisitor(headers, now);
    expect(hashVisitor(headers, new Date('2026-11-09T00:00:00Z'))).toBe(first);
    expect(hashVisitor(headers, new Date('2026-11-10T00:00:00Z'))).not.toBe(first);
    vi.useFakeTimers();
    vi.setSystemTime(now);
    expect(hashVisitor(headers)).toBe(first);
    vi.stubEnv('IP_HASH_SALT', 'second-test-only-salt-0000000000000000');
    resetEnvForTests();
    expect(hashVisitor(headers, now)).not.toBe(first);
  });

  it('never exposes raw addresses in return values, errors, stdout or stderr (NFR-12)', () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const ip = '2001:DB8::ABCD%eth0';
    const headers = new Headers({ 'x-real-ip': ip });
    const result = hashVisitor(headers, now);
    expect(result).toMatch(/^[a-f0-9]{64}$/);
    vi.stubEnv('IP_HASH_SALT', '');
    resetEnvForTests();
    let failure: unknown;
    try {
      hashVisitor(headers, now);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    const output = JSON.stringify([result, String(failure), stdout.mock.calls, stderr.mock.calls]);
    expect(output.toLowerCase()).not.toContain('2001:db8::abcd');
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).not.toHaveBeenCalled();
  });
});
