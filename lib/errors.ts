import { z } from 'zod';

export const ERROR_CODES = [
  'ACCESS_DENIED',
  'VALIDATION_FAILED',
  'ORIGIN_FORBIDDEN',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'RATE_LIMITED_IP',
  'RATE_LIMITED_GLOBAL',
  'DEMO_READONLY',
  'DEMO_OFF',
  'PROVIDER_ERROR',
  'PROVIDER_TIMEOUT',
  'RETRIEVAL_ERROR',
  'INTERNAL_ERROR',
  'CONFIG_INVALID',
  'CORPUS_MISMATCH',
  'CORPUS_EMPTY',
  'NEEDS_CONFIRMATION',
  'CHECKS_FAILED',
] as const;
export const PROVIDER_ERROR_MESSAGE = 'The language model did not respond.';
export const PROVIDER_TIMEOUT_MESSAGE = 'The language model took too long to respond.';
export const RETRIEVAL_ERROR_MESSAGE = 'Search failed.';
export const INTERNAL_ERROR_MESSAGE = 'Unexpected server error.';

export type ErrorCode = (typeof ERROR_CODES)[number];
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly options: { cause?: unknown; retryable?: boolean } = {},
  ) {
    super(message, { cause: options.cause });
  }
}
export const ErrorCodeSchema = z.enum(ERROR_CODES);
export const ErrorBody = z.object({
  error: z.object({
    code: ErrorCodeSchema, // section 18
    message: z.string(), // safe, user-facing English
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- byte-exact normative TRD §11.1 schema
    requestId: z.string().uuid(),
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- byte-exact normative TRD §11.1 schema
    resetAt: z.string().datetime().optional(), // rate limits only
    details: z.record(z.string(), z.unknown()).optional(), // validation only: { field, reason }
  }),
});
