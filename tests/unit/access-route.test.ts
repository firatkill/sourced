// TC-239–TC-241 / FR-90 / TRD §38.
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { POST } from '@/app/api/access/route';
import * as runtime from '@/lib/kit/runtime-config';
import * as limiter from '@/lib/ratelimit/limiter';
import { resetEnvForTests } from '@/lib/env';
import { deriveCookie } from '@/lib/access/cookie';
import { ACCESS_COPY } from '@/lib/copy';
const token = 'test-access-token-0000000000000000';
const config = runtime.getKitConfig();
function request(
  value = token,
  host = 'http://localhost:3000',
  headers: Record<string, string> = {},
) {
  const form = new FormData();
  form.set('token', value);
  return new Request(`${host}/api/access`, { method: 'POST', body: form, headers });
}
beforeEach(() => {
  vi.stubEnv('SOURCED_ACCESS_TOKEN', token);
  resetEnvForTests();
  vi.spyOn(runtime, 'getKitConfig').mockReturnValue({ ...config, profile: 'private' });
  vi.spyOn(limiter, 'consumeAccess').mockResolvedValue({
    ok: true,
    resetAt: new Date('2026-11-11T13:00:00Z'),
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetEnvForTests();
});
test.each(['http://localhost:3000', 'https://private.example'])(
  'TC-239: success cookie attributes at %s',
  async (host) => {
    const response = await POST(request(token, host));
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(`${host}/`);
    const cookie = response.headers.get('set-cookie');
    expect(cookie).toContain(`sourced_access=${await deriveCookie(token)}`);
    for (const value of ['HttpOnly', 'SameSite=lax', 'Path=/', 'Max-Age=2592000'])
      expect(cookie).toContain(value);
    expect(cookie?.includes('Secure')).toBe(host.startsWith('https'));
    expect(limiter.consumeAccess).not.toHaveBeenCalled();
  },
);
test('TC-240: wrong token consumes only access quota and returns exact copy', async () => {
  const response = await POST(request('wrong'));
  expect(response.status).toBe(401);
  expect(await response.json()).toMatchObject({
    error: { code: 'ACCESS_DENIED', message: ACCESS_COPY.error },
  });
  expect(limiter.consumeAccess).toHaveBeenCalledWith(
    expect.stringMatching(/^[a-f0-9]{64}$/),
    expect.any(Date),
  );
  expect(response.headers.has('set-cookie')).toBe(false);
});
test('TC-240: exhausted attempts return 429, resetAt and Retry-After', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-11T12:30:00Z'));
  vi.mocked(limiter.consumeAccess).mockResolvedValue({
    ok: false,
    resetAt: new Date('2026-11-11T13:00:00Z'),
  });
  try {
    const response = await POST(request('wrong'));
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('1800');
    expect(await response.json()).toMatchObject({
      error: { code: 'RATE_LIMITED_IP', message: ACCESS_COPY.limited },
    });
  } finally {
    vi.useRealTimers();
  }
});
test.each([{ origin: 'https://attacker.example' }, { 'sec-fetch-site': 'cross-site' }])(
  'TC-240: origin guard %j',
  async (headers) => {
    const response = await POST(request(token, 'http://localhost:3000', headers));
    expect(response.status).toBe(403);
    expect(response.headers.has('set-cookie')).toBe(false);
    expect(limiter.consumeAccess).not.toHaveBeenCalled();
  },
);
test.each(['local', 'public-demo'] as const)(
  'TC-241: %s access endpoint is unavailable',
  async (profile) => {
    vi.mocked(runtime.getKitConfig).mockReturnValue({ ...config, profile });
    const response = await POST(request());
    expect(response.status).toBe(404);
    expect(response.headers.has('set-cookie')).toBe(false);
    expect(limiter.consumeAccess).not.toHaveBeenCalled();
  },
);

test('TC-240: malformed form body is rejected by the request boundary', async () => {
  const response = await POST(
    new Request('http://localhost:3000/api/access', { method: 'POST', body: '{' }),
  );
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
  expect(response.headers.has('set-cookie')).toBe(false);
});
test('TC-240: a missing token field is a failed access attempt', async () => {
  const response = await POST(
    new Request('http://localhost:3000/api/access', { method: 'POST', body: new FormData() }),
  );
  expect(response.status).toBe(401);
  expect(limiter.consumeAccess).toHaveBeenCalledOnce();
});
