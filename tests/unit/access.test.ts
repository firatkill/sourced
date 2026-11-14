// UT-48 / TC-238 / FR-90 / D-134.
import { createHmac } from 'node:crypto';
import { afterEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { constantTimeEqual, deriveCookie, validCookie } from '@/lib/access/cookie';
import { accessDecision } from '@/lib/access/decision';
import { hashVisitor } from '@/lib/ratelimit/ip';
import {
  getSnapshotConfig,
  setCliKitConfig,
  resetKitConfigForTests,
} from '@/lib/kit/runtime-config';
import { middleware } from '../../middleware';
const snapshot = getSnapshotConfig();
const token = 'test-access-token-0000000000000000';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetKitConfigForTests();
});
test('TC-238: normative HMAC, exact comparison, malformed values and rotation', async () => {
  const cookie = await deriveCookie(token);
  expect(cookie).toBe(createHmac('sha256', token).update('sourced-access-v1').digest('base64url'));
  expect(await constantTimeEqual('same', 'same')).toBe(true);
  expect(await constantTimeEqual('same', 'different')).toBe(false);
  for (const candidate of [undefined, '', cookie + '=', cookie.slice(1), token])
    expect(await validCookie(token, candidate)).toBe(false);
  expect(await validCookie(token, cookie)).toBe(true);
  expect(await validCookie(token + 'rotated', cookie)).toBe(false);
  expect(await validCookie(undefined, cookie)).toBe(false);
});
test('TC-238: profiles × paths × methods × cookie states', () => {
  for (const profile of ['local', 'private', 'public-demo'] as const)
    for (const path of [
      '/',
      '/eval',
      '/how-it-works',
      '/api/ask',
      '/api/health',
      '/access',
      '/api/access',
      '/_next/static/main.js',
      '/favicon.svg',
    ])
      for (const method of ['GET', 'POST', 'HEAD'])
        for (const validCookie of [true, false]) {
          const protectedPath = ['/', '/eval', '/how-it-works', '/api/ask'].includes(path);
          expect(accessDecision({ profile, path, method, validCookie })).toBe(
            profile === 'private' && !validCookie && protectedPath
              ? path === '/api/ask'
                ? 'deny'
                : 'redirect'
              : 'allow',
          );
        }
});
test('TC-240: private visitor hash uses binary derived key, normalized IP and UTC day', () => {
  const now = new Date('2026-11-11T12:30:00Z');
  const headers = new Headers({ 'x-real-ip': 'FE80::1%en0, 192.0.2.2' });
  const key = createHmac('sha256', token).update('sourced-visitor-v1').digest();
  const hash = hashVisitor(headers, now, token);
  expect(hash).toBe(createHmac('sha256', key).update('2026-11-11:fe80::1').digest('hex'));
  expect(hashVisitor(headers, now, token + 'rotated')).not.toBe(hash);
});
test('TC-238: middleware denies ask, redirects pages, preserves headers and accepts cookie', async () => {
  setCliKitConfig({ ...snapshot, profile: 'private' });
  vi.stubEnv('SOURCED_ACCESS_TOKEN', token);
  const response = await middleware(
    new NextRequest('http://localhost/api/ask', { method: 'POST' }),
  );
  expect(response.status).toBe(401);
  expect(await response.json()).toMatchObject({ error: { code: 'ACCESS_DENIED' } });
  expect(response.headers.get('content-security-policy')).toContain("'strict-dynamic'");
  const page = await middleware(new NextRequest('http://localhost/eval'));
  expect(page.headers.get('location')).toBe('http://localhost/access');
  const admitted = await middleware(
    new NextRequest('http://localhost/', {
      headers: { cookie: `sourced_access=${await deriveCookie(token)}` },
    }),
  );
  expect(admitted.headers.get('x-middleware-next')).toBe('1');
});
test.each(['local', 'public-demo'] as const)(
  'TC-241: %s middleware never sets a cookie',
  async (profile) => {
    setCliKitConfig({ ...snapshot, profile });
    for (const path of ['/', '/access', '/api/access', '/api/ask', '/api/health']) {
      const response = await middleware(new NextRequest(`http://localhost${path}`));
      expect(response.headers.has('set-cookie')).toBe(false);
      expect(response.headers.get('x-middleware-next')).toBe('1');
    }
  },
);
