import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ACCESS_COOKIE, constantTimeEqual, deriveCookie } from '@/lib/access/cookie';
import { ACCESS } from '@/lib/config';
import { ACCESS_COPY } from '@/lib/copy';
import { getEnv } from '@/lib/env';
import { jsonError } from '@/lib/http/errors';
import { allowedOrigin } from '@/lib/http/origin';
import { getKitConfig } from '@/lib/kit/runtime-config';
import { hashVisitor } from '@/lib/ratelimit/ip';
import { consumeAccess } from '@/lib/ratelimit/limiter';

export const runtime = 'nodejs';
const Body = z.object({ token: z.string() });
export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  if (getKitConfig().profile !== 'private') return new Response(null, { status: 404 });
  if (!allowedOrigin(request))
    return jsonError({ code: 'ORIGIN_FORBIDDEN', status: 403, requestId });
  try {
    let data: unknown;
    try {
      data = Object.fromEntries(await request.formData());
    } catch {
      return jsonError({ code: 'VALIDATION_FAILED', status: 400, requestId });
    }
    const body = Body.safeParse(data);
    const token = getEnv().SOURCED_ACCESS_TOKEN;
    if (!token || token.length < 24)
      return jsonError({ code: 'CONFIG_INVALID', status: 500, requestId });
    if (!body.success || !(await constantTimeEqual(token, body.data.token))) {
      const now = new Date();
      const quota = await consumeAccess(hashVisitor(request.headers, now, token), now);
      return Response.json(
        {
          error: {
            code: quota.ok ? 'ACCESS_DENIED' : 'RATE_LIMITED_IP',
            message: quota.ok ? ACCESS_COPY.error : ACCESS_COPY.limited,
            requestId,
            ...(!quota.ok ? { resetAt: quota.resetAt.toISOString() } : {}),
          },
        },
        {
          status: quota.ok ? 401 : 429,
          headers: {
            'Cache-Control': 'no-store',
            ...(!quota.ok
              ? {
                  'Retry-After': String(
                    Math.ceil((quota.resetAt.getTime() - now.getTime()) / 1000),
                  ),
                }
              : {}),
          },
        },
      );
    }
    const response = NextResponse.redirect(new URL('/', request.url), 303);
    response.headers.set('Cache-Control', 'no-store');
    response.cookies.set(ACCESS_COOKIE, await deriveCookie(token), {
      httpOnly: true,
      secure: !['localhost', '127.0.0.1', '[::1]'].includes(new URL(request.url).hostname),
      sameSite: 'lax',
      path: '/',
      maxAge: ACCESS.COOKIE_MAX_AGE_SECONDS,
    });
    return response;
  } catch {
    return jsonError({ code: 'INTERNAL_ERROR', status: 500, requestId });
  }
}
