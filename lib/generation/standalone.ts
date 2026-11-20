import 'server-only';
import { z } from 'zod';
import { FOLLOWUP, QUESTION } from '@/lib/config';
import type { TokenUsage } from '@/lib/cost/estimate';
import { getProviders } from '@/lib/llm';
import { createLogger } from '@/lib/logger';
import {
  FOLLOWUP_SYSTEM_PROMPT,
  buildFollowupPrompt,
  type FollowupTurn,
} from '@/lib/prompts/followup';

const Output = z.object({ question: z.string() });

/**
 * T-85 / FR-91, D-143: one chat-model call rewrites a follow-up into a standalone question.
 * Any failure keeps the original question, so a follow-up never fails because of the rewrite.
 */
export async function standaloneQuestion(input: {
  question: string;
  history: readonly FollowupTurn[];
  signal: AbortSignal;
}): Promise<{ question: string; usage: TokenUsage; rewritten: boolean }> {
  const none = { inputTokens: 0, outputTokens: 0 };
  if (input.history.length === 0)
    return { question: input.question, usage: none, rewritten: false };
  const abortSignal = AbortSignal.any([input.signal, AbortSignal.timeout(FOLLOWUP.TIMEOUT_MS)]);
  try {
    const result = await getProviders().chat.generateObject({
      model: 'chat',
      system: FOLLOWUP_SYSTEM_PROMPT,
      prompt: buildFollowupPrompt(input.history, input.question),
      schema: Output,
      maxOutputTokens: FOLLOWUP.MAX_OUTPUT_TOKENS,
      abortSignal,
    });
    input.signal.throwIfAborted();
    const question = Output.parse(result.object).question.replace(/\s+/g, ' ').trim();
    if (question.length < QUESTION.MIN_CHARS || question.length > QUESTION.MAX_CHARS)
      return { question: input.question, usage: result.usage, rewritten: false };
    return { question, usage: result.usage, rewritten: question !== input.question };
  } catch (error) {
    input.signal.throwIfAborted();
    createLogger().warn({
      event: 'followup.fallback',
      reason: error instanceof DOMException && error.name === 'TimeoutError' ? 'timeout' : 'error',
    });
    return { question: input.question, usage: none, rewritten: false };
  }
}
