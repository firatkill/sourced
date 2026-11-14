import 'server-only';
import { getEnv } from '@/lib/env';

export function allowedOrigin(request: Request): boolean {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return false;
  const origin = request.headers.get('origin');
  if (origin === null) return true;
  const env = getEnv();
  const allowed = new Set([
    new URL(env.NEXT_PUBLIC_SITE_URL).origin,
    ...[env.VERCEL_URL, env.VERCEL_BRANCH_URL, env.VERCEL_PROJECT_PRODUCTION_URL]
      .filter((host): host is string => typeof host === 'string' && host.length > 0)
      .map((host) => `https://${host}`),
    ...env.ALLOWED_ORIGINS.split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  ]);
  if (allowed.has(origin)) return true;
  if (env.VERCEL_ENV === 'production') return false;
  try {
    const url = new URL(origin);
    return (
      url.origin === origin &&
      url.protocol === 'http:' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
    );
  } catch {
    return false;
  }
}
