import { z } from 'zod';
import { QUESTION } from '@/lib/config';
import { SUGGESTED_IDS } from '@/lib/suggested';

export const AskRequest = z
  .object({
    question: z
      .string()
      .transform((s) => s.replace(/\s+/g, ' ').trim())
      .pipe(z.string().min(QUESTION.MIN_CHARS).max(QUESTION.MAX_CHARS)),
    suggestedId: z.enum(SUGGESTED_IDS).optional(),
  })
  .strict();
export type AskRequest = z.infer<typeof AskRequest>;

export type ValidationDetails = {
  field: 'question' | 'suggestedId' | 'body';
  reason: 'too_short' | 'too_long' | 'required' | 'invalid_json' | 'unknown_field' | 'invalid_type';
  length?: number;
};

/** Translate Zod issues without exposing input values or internal error messages. */
export function validationDetails(error: z.ZodError, body: unknown): ValidationDetails {
  const issue = error.issues[0];
  const field =
    issue?.path[0] === 'question' || issue?.path[0] === 'suggestedId' ? issue.path[0] : 'body';
  if (issue?.code === 'unrecognized_keys') return { field: 'body', reason: 'unknown_field' };
  const question =
    typeof body === 'object' && body !== null && 'question' in body ? body.question : undefined;
  if (field === 'question') {
    if (question === undefined) return { field, reason: 'required' };
    if (typeof question === 'string') {
      const length = question.replace(/\s+/g, ' ').trim().length;
      if (length === 0) return { field, reason: 'required' };
      if (issue?.code === 'too_small') return { field, reason: 'too_short' };
      if (issue?.code === 'too_big') return { field, reason: 'too_long', length };
    }
  }
  return { field, reason: 'invalid_type' };
}
