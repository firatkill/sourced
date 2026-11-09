import type { z } from 'zod';
import { JUDGE } from '@/lib/config';
import type { TokenUsage } from '@/lib/cost/estimate';
import { getProvider } from '@/lib/llm';
import type { LlmProvider } from '@/lib/llm/types';
import { buildJudgePrompt, JUDGE_SYSTEM_PROMPT, JudgeOutput } from '@/lib/prompts/judge';
import type { NumberedPassage } from '@/lib/prompts/sanitize';

export async function judgeAnswer(
  answer: string,
  passages: readonly NumberedPassage[],
  options: { provider?: LlmProvider; onUsage?: (usage: TokenUsage) => void } = {},
): Promise<z.infer<typeof JudgeOutput>> {
  const result = await (options.provider ?? getProvider()).generateObject({
    model: 'judge',
    system: JUDGE_SYSTEM_PROMPT,
    prompt: buildJudgePrompt(answer, passages),
    schema: JudgeOutput,
    maxOutputTokens: JUDGE.MAX_OUTPUT_TOKENS,
    abortSignal: AbortSignal.timeout(JUDGE.TIMEOUT_MS),
  });
  options.onUsage?.(result.usage);
  return JudgeOutput.parse(result.object);
}
