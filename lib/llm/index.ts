import 'server-only';
import { JSONParseError, NoObjectGeneratedError, TypeValidationError } from 'ai';
import { z } from 'zod';
import { EMBEDDING } from '@/lib/config';
import { getEnv } from '@/lib/env';
import { mockProvider } from './mock';
import { createOpenaiProvider } from './openai';
import { getKitConfig } from '@/lib/kit/runtime-config';
import { createMockProvider } from './mock';
import { AppError } from '@/lib/errors';
import type { LlmProvider, Role } from './types';

export function getProviders(): Record<Role, LlmProvider> {
  const config = getKitConfig();
  const resolve = (role: Role): LlmProvider => {
    const model = config.models[role] ?? config.models.chat;
    if (getEnv().LLM_MODE === 'mock' || model.provider === 'mock') {
      return config.models.embed.dimensions === EMBEDDING.DIMENSIONS
        ? mockProvider
        : createMockProvider(config.models.embed.dimensions);
    }
    if (model.provider === 'openai')
      return createOpenaiProvider(undefined, model.model, config.models.embed);
    throw new AppError(
      'CONFIG_INVALID',
      `models.${role}.provider: ${model.provider} adapter is not installed yet (T-49).`,
    );
  };
  const chat = resolve('chat');
  return {
    chat,
    embed: resolve('embed'),
    rerank: config.models.rerank ? resolve('rerank') : chat,
    judge: config.models.judge ? resolve('judge') : chat,
    generate: config.models.generate ? resolve('generate') : chat,
  };
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
