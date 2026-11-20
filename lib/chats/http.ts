import 'server-only';
import { z } from 'zod';
import { jsonError } from '@/lib/http/errors';
import { allowedOrigin } from '@/lib/http/origin';
import { isPublicDemo } from '@/lib/kit/profile';
import { withRequest } from '@/lib/logger';
import { NotFoundError } from './store';

/**
 * D-142 / REDESIGN-v2 §5: shared handling for /api/chats and /api/projects. The routes do not
 * exist under public-demo (404); mutations must be same-origin; bodies are strict JSON.
 */
export async function chatRoute(
  request: Request,
  handler: (body: unknown) => Promise<Response>,
): Promise<Response> {
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
  const logger = withRequest(requestId);
  if (isPublicDemo()) return jsonError({ code: 'NOT_FOUND', status: 404, requestId });
  const mutating = request.method !== 'GET' && request.method !== 'HEAD';
  if (mutating && !allowedOrigin(request))
    return jsonError({ code: 'ORIGIN_FORBIDDEN', status: 403, requestId });
  let body: unknown;
  if (request.method === 'POST' || request.method === 'PATCH') {
    if (
      request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
      'application/json'
    )
      return jsonError({ code: 'UNSUPPORTED_MEDIA_TYPE', status: 415, requestId });
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > 8_192)
      return jsonError({ code: 'PAYLOAD_TOO_LARGE', status: 413, requestId });
    try {
      body = JSON.parse(text);
    } catch {
      return jsonError({
        code: 'VALIDATION_FAILED',
        status: 400,
        requestId,
        details: { field: 'body', reason: 'invalid_json' },
      });
    }
  }
  try {
    return await handler(body);
  } catch (error) {
    if (error instanceof NotFoundError)
      return jsonError({ code: 'NOT_FOUND', status: 404, requestId });
    if (error instanceof z.ZodError)
      return jsonError({
        code: 'VALIDATION_FAILED',
        status: 400,
        requestId,
        details: {
          field: 'body',
          reason: error.issues[0]?.code === 'unrecognized_keys' ? 'unknown_field' : 'invalid_type',
        },
      });
    logger.error({ event: 'chats.error', errorMessage: 'Unexpected server error.' });
    return jsonError({ code: 'INTERNAL_ERROR', status: 500, requestId });
  }
}

export const noStore = { 'Cache-Control': 'no-store' } as const;

export const CreateChatBody = z
  .object({
    question: z.string().optional(),
    title: z.string().optional(),
    projectId: z.uuid().nullable().optional(),
  })
  .strict();
export const UpdateChatBody = z
  .object({
    title: z.string().optional(),
    projectId: z.uuid().nullable().optional(),
    pinned: z.boolean().optional(),
  })
  .strict();
export const CreateProjectBody = z
  .object({ name: z.string(), description: z.string().nullable().optional() })
  .strict();
export const UpdateProjectBody = z
  .object({ name: z.string().optional(), description: z.string().nullable().optional() })
  .strict();
