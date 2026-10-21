import { afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '../../proxy';
import { resetEnvForTests } from '@/lib/env';

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvForTests();
});
it('TC-010: NFR-14 fresh ids and nonces, security headers, production CSP', () => {
  vi.stubEnv('NODE_ENV', 'production');
  resetEnvForTests();
  const request = new NextRequest('http://localhost:3000', {
    headers: { 'x-request-id': 'client-supplied' },
  });
  const first = proxy(request);
  const second = proxy(request);
  expect(first.headers.get('x-request-id')).not.toBe('client-supplied');
  expect(first.headers.get('x-request-id')).not.toBe(second.headers.get('x-request-id'));
  const csp = first.headers.get('content-security-policy');
  expect(csp).toContain("'strict-dynamic'");
  expect(csp).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
  expect(csp).not.toBe(second.headers.get('content-security-policy'));
  expect(csp).not.toContain('unsafe-eval');
  expect(csp?.split(';').find((p) => p.includes('script-src'))).not.toContain('unsafe-inline');
  expect(csp).not.toContain('upgrade-insecure-requests');
  expect(first.headers.get('x-middleware-request-content-security-policy')).toBe(csp);
  for (const [name, value] of Object.entries({
    'strict-transport-security': 'max-age=63072000; includeSubDomains',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'cross-origin-opener-policy': 'same-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
  }))
    expect(first.headers.get(name)).toBe(value);
});
it('TC-010: development eval allowance and deployed HTTPS upgrade follow env', () => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('VERCEL_ENV', 'preview');
  resetEnvForTests();
  const csp = proxy(new NextRequest('https://preview.example')).headers.get(
    'content-security-policy',
  );
  expect(csp).toContain("'unsafe-eval'");
  expect(csp).toContain('upgrade-insecure-requests');
});
