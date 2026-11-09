import { QUESTION } from '@/lib/config';
import { ErrorBody, type ErrorCode } from '@/lib/errors';
import type { ValidationDetails } from './ask-request';

export function jsonError(input: {
  code: ErrorCode;
  status: number;
  requestId: string;
  details?: ValidationDetails;
  resetAt?: Date;
  retryAfter?: number;
}): Response {
  let message = 'Something went wrong on our side';
  if (input.code === 'DEMO_OFF') message = 'The demo is offline for maintenance';
  if (input.code === 'DEMO_READONLY')
    message =
      'Live answers are paused. The six suggested questions below were answered in advance and still work.';
  if (input.code === 'RATE_LIMITED_IP') message = 'You’ve reached today’s limit';
  if (input.code === 'RATE_LIMITED_GLOBAL') message = 'The demo has reached its daily limit';
  if (input.details?.reason === 'required') message = 'Type a question first.';
  if (input.details?.reason === 'too_short')
    message = 'That’s too short to search for. Try a full question.';
  if (input.details?.reason === 'too_long' && input.details.length !== undefined)
    message = `Questions can be up to ${String(QUESTION.MAX_CHARS)} characters. Yours is ${String(input.details.length)}.`;
  const body = ErrorBody.parse({
    error: {
      code: input.code,
      message,
      requestId: input.requestId,
      ...(input.details ? { details: input.details } : {}),
      ...(input.resetAt ? { resetAt: input.resetAt.toISOString() } : {}),
    },
  });
  return Response.json(body, {
    status: input.status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Request-Id': input.requestId,
      ...(input.retryAfter !== undefined ? { 'Retry-After': String(input.retryAfter) } : {}),
    },
  });
}
