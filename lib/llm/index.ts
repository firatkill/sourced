import 'server-only';
import { JSONParseError, NoObjectGeneratedError, TypeValidationError } from 'ai';
import { z } from 'zod';
import { AppError } from '@/lib/errors';
import { getEnv } from '@/lib/env';
import { mockProvider } from './mock';
import { openaiProvider } from './openai';
import type { LlmProvider } from './types';

export function getProvider(): LlmProvider {
  return getEnv().LLM_MODE === 'mock' ? mockProvider : openaiProvider;
}

/** Inspect failures locally; never expose their causes in logs or responses. */
export function isInvalidOutput(error: unknown): boolean {
  const cause = error instanceof AppError ? error.cause : error;
  return (
    cause instanceof z.ZodError ||
    NoObjectGeneratedError.isInstance(cause) ||
    JSONParseError.isInstance(cause) ||
    TypeValidationError.isInstance(cause)
  );
}
