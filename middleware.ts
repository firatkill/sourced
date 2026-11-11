import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_COOKIE, validCookie } from '@/lib/access/cookie';
import { accessDecision } from '@/lib/access/decision';
import { jsonError } from '@/lib/http/errors';
import { getSnapshotConfig } from '@/lib/kit/runtime-config';
import { getMiddlewareEnv } from '@/lib/env';

export async function middleware(request: NextRequest) {
  const env = getMiddlewareEnv();
  const requestId = crypto.randomUUID();
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64');
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "object-src 'none'",
    ...(env.VERCEL_ENV ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
  const headers = new Headers(request.headers);
  headers.set('x-request-id', requestId);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', policy);
  let profile: ReturnType<typeof getSnapshotConfig>['profile'] | undefined;
  try {
    profile = getSnapshotConfig().profile;
  } catch {
    // No trusted profile: a configured token signals private intent. Never accept
    // a cookie until the snapshot is valid; health/access remain available.
  }
  const unknownApi =
    profile === undefined &&
    request.nextUrl.pathname.startsWith('/api/') &&
    request.nextUrl.pathname !== '/api/ask';
  const decision = unknownApi
    ? 'allow'
    : accessDecision({
        profile: profile ?? (env.SOURCED_ACCESS_TOKEN ? 'private' : 'local'),
        path: request.nextUrl.pathname,
        method: request.method,
        validCookie:
          profile === 'private' &&
          (await validCookie(env.SOURCED_ACCESS_TOKEN, request.cookies.get(ACCESS_COOKIE)?.value)),
      });
  const response =
    decision === 'redirect'
      ? NextResponse.redirect(new URL('/access', request.url))
      : decision === 'deny'
        ? jsonError({ code: 'ACCESS_DENIED', status: 401, requestId })
        : NextResponse.next({ request: { headers } });
  for (const [name, value] of Object.entries({
    'Content-Security-Policy': policy,
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
    'X-Request-Id': requestId,
  }))
    response.headers.set(name, value);
  return response;
}
export const config = {
  runtime: 'nodejs',
  matcher: ['/((?!_next/static|_next/image|favicon.svg).*)'],
};
