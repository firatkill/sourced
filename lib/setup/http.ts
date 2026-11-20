import 'server-only';
// T-89 / R2 §5–6: shared handling for /api/setup/* and /api/settings/*. The routes exist
// only in the local profile, need the setup cookie, and every mutation must carry a
// same-host Origin (curl and other pages cannot spend money or write secrets).
import { cookies } from 'next/headers';
import { z } from 'zod';
import { AppError, ErrorBody, type ErrorCode } from '@/lib/errors';
import { getSnapshotConfig } from '@/lib/kit/runtime-config';
import { withRequest } from '@/lib/logger';
import { SETUP_COOKIE, validSetupCookie } from './token';

export function setupError(
  code: ErrorCode,
  status: number,
  requestId: string,
  message: string,
  details?: Record<string, unknown>,
): Response {
  return Response.json(
    ErrorBody.parse({ error: { code, message, requestId, ...(details ? { details } : {}) } }),
    { status, headers: { 'Cache-Control': 'no-store', 'X-Request-Id': requestId } },
  );
}

/** Errors whose message is written for people (CLI copy); anything else is generic. */
const SAFE_CODES = new Set<ErrorCode>([
  'VALIDATION_FAILED',
  'CONFIG_INVALID',
  'CORPUS_EMPTY',
  'CORPUS_MISMATCH',
  'NEEDS_CONFIRMATION',
  'UNSUPPORTED_MEDIA_TYPE',
  'NOT_FOUND',
]);

export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host') ?? new URL(request.url).host;
  if (!origin) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

type Options = { maxBytes?: number; body?: 'json' | 'form' | 'none' };
export async function setupRoute(
  request: Request,
  handler: (input: {
    body: unknown;
    form: FormData | null;
    requestId: string;
  }) => Promise<Response>,
  options: Options = {},
): Promise<Response> {
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
  const logger = withRequest(requestId);
  let profile: string | undefined;
  try {
    profile = getSnapshotConfig().profile;
  } catch {
    profile = undefined;
  }
  if (profile !== 'local') return setupError('NOT_FOUND', 404, requestId, 'Not found');
  if (!validSetupCookie((await cookies()).get(SETUP_COOKIE)?.value))
    return setupError(
      'ACCESS_DENIED',
      401,
      requestId,
      'Open the setup link from your terminal. Run ./sourced setup for a new one.',
    );
  const mutating = request.method !== 'GET' && request.method !== 'HEAD';
  if (mutating && !sameOrigin(request))
    return setupError('ORIGIN_FORBIDDEN', 403, requestId, 'This request came from another site.');
  const kind = options.body ?? (mutating ? 'json' : 'none');
  let body: unknown;
  let form: FormData | null = null;
  const declared = Number(request.headers.get('content-length') ?? '0');
  const maxBytes = options.maxBytes ?? 8_192;
  if (declared > maxBytes)
    return setupError('PAYLOAD_TOO_LARGE', 413, requestId, 'That is too large to send.');
  if (kind === 'json' && request.method !== 'DELETE') {
    const type = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
    if (type !== 'application/json')
      return setupError('UNSUPPORTED_MEDIA_TYPE', 415, requestId, 'Send JSON.');
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes)
      return setupError('PAYLOAD_TOO_LARGE', 413, requestId, 'That is too large to send.');
    try {
      body = JSON.parse(text);
    } catch {
      return setupError('VALIDATION_FAILED', 400, requestId, 'Send valid JSON.', {
        field: 'body',
        reason: 'invalid_json',
      });
    }
  } else if (kind === 'form') {
    try {
      form = await request.formData();
    } catch {
      return setupError('VALIDATION_FAILED', 400, requestId, 'Send the files as a form upload.');
    }
  }
  try {
    return await handler({ body, form, requestId });
  } catch (error) {
    if (error instanceof z.ZodError)
      return setupError('VALIDATION_FAILED', 400, requestId, 'Check the values and try again.', {
        field: String(error.issues[0]?.path[0] ?? 'body'),
        reason: error.issues[0]?.code === 'unrecognized_keys' ? 'unknown_field' : 'invalid_type',
      });
    if (error instanceof AppError && SAFE_CODES.has(error.code))
      return setupError(
        error.code,
        error.code === 'NOT_FOUND' ? 404 : 400,
        requestId,
        error.message,
      );
    // Never log the error text: it can contain a key or a provider response.
    logger.error({
      event: 'setup.error',
      code: error instanceof AppError ? error.code : null,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return setupError('INTERNAL_ERROR', 500, requestId, 'Unexpected server error.');
  }
}
