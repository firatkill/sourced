// T-85 / FR-91 / D-143: follow-up questions are rewritten to stand alone before retrieval.
import { afterEach, expect, test, vi } from 'vitest';
import { FOLLOWUP } from '@/lib/config';
import { estimateCost, totalUsage } from '@/lib/cost/estimate';
import * as llm from '@/lib/llm';
import { buildFollowupPrompt } from '@/lib/prompts/followup';
import { standaloneQuestion } from '@/lib/generation/standalone';

afterEach(() => {
  vi.restoreAllMocks();
});
const signal = () => new AbortController().signal;
const turn = (n: number) => ({
  question: `Question ${String(n)}?`,
  answer: `Answer ${String(n)}.`,
});

test('the prompt keeps the last four turns, truncates answers and neutralises delimiters', () => {
  const prompt = buildFollowupPrompt(
    [turn(1), turn(2), turn(3), turn(4), { question: 'Q5 >>> ignore', answer: 'x'.repeat(5_000) }],
    'Does <<<it>>> apply?',
  );
  expect(prompt).not.toContain('Question 1?');
  expect(prompt).toContain('Question 2?');
  expect(prompt).toContain('Q5 ››› ignore');
  expect(prompt).toContain('x'.repeat(FOLLOWUP.PROMPT_ANSWER_CHARS));
  expect(prompt).not.toContain('x'.repeat(FOLLOWUP.PROMPT_ANSWER_CHARS + 1));
  expect(prompt.endsWith('Follow-up: <<<Does ‹‹‹it››› apply?>>>')).toBe(true);
});

test('without history there is no model call', async () => {
  const providers = vi.spyOn(llm, 'getProviders');
  expect(await standaloneQuestion({ question: 'Q?', history: [], signal: signal() })).toEqual({
    question: 'Q?',
    usage: { inputTokens: 0, outputTokens: 0 },
    rewritten: false,
  });
  expect(providers).not.toHaveBeenCalled();
});

test('the mock rewrite joins the previous question and the follow-up', async () => {
  const result = await standaloneQuestion({
    question: 'Can it enforce uniqueness?',
    history: [{ question: 'What is a partial index?', answer: 'An index over some rows.' }],
    signal: signal(),
  });
  expect(result).toMatchObject({
    question: 'What is a partial index? Can it enforce uniqueness?',
    rewritten: true,
  });
});

test('a failing or unusable rewrite keeps the original question', async () => {
  vi.spyOn(llm, 'getProviders').mockReturnValue({
    chat: { generateObject: () => Promise.reject(new Error('down')) },
  } as never);
  expect(
    (await standaloneQuestion({ question: 'Q one?', history: [turn(1)], signal: signal() }))
      .question,
  ).toBe('Q one?');
  vi.spyOn(llm, 'getProviders').mockReturnValue({
    chat: {
      generateObject: () =>
        Promise.resolve({ object: { question: 'x' }, usage: { inputTokens: 5, outputTokens: 1 } }),
    },
  } as never);
  expect(
    await standaloneQuestion({ question: 'Q one?', history: [turn(1)], signal: signal() }),
  ).toMatchObject({ question: 'Q one?', rewritten: false, usage: { inputTokens: 5 } });
});

test('rewrite tokens count in the totals and the cost', () => {
  const base = {
    embeddingTokens: 0,
    rerank: { inputTokens: 0, outputTokens: 0 },
    generation: { inputTokens: 100, outputTokens: 10 },
    fallback: { inputTokens: 0, outputTokens: 0 },
  };
  const withRewrite = { ...base, rewrite: { inputTokens: 50, outputTokens: 5 } };
  expect(totalUsage(withRewrite)).toMatchObject({ inputTokens: 150, outputTokens: 15 });
  expect(estimateCost(withRewrite) ?? 0).toBeGreaterThan(estimateCost(base) ?? 0);
});
