// TC-185 / UT-49 / TRD §31.4: unknown costs survive suggested-cache persistence.
import { expect, test, vi } from 'vitest';
import { cacheSuggested } from '../../scripts/cache-suggested';
import { CachedAnswerPayload } from '@/lib/cache/answer-cache';
import { SUGGESTED } from '@/lib/suggested';
import { meta, citations, done } from '../fixtures/sse-streams';
import type { SseEvent } from '@/lib/sse/events';
const doubles = vi.hoisted(() => ({ write: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/cache/answer-cache', async (original) => ({
  ...(await original<typeof import('@/lib/cache/answer-cache')>()),
  currentCacheVersion: () =>
    Promise.resolve({ corpusVersion: 'test', chatModel: 'test', promptVersion: 'test' }),
  writeAnswerCache: doubles.write,
}));
vi.mock('@/lib/generation/answer', () => ({
  answerQuestion: ({ emit }: { emit: (event: SseEvent) => void }) => {
    const unknownDone = { ...done, costUsdEstimate: null };
    emit({ event: 'meta', data: meta });
    emit({ event: 'citations', data: citations });
    emit({ event: 'done', data: unknownDone });
    return Promise.resolve({ done: unknownDone });
  },
}));
test('TC-185 / UT-49: null cache costs stay null in the payload and combined CLI estimate', async () => {
  expect(
    CachedAnswerPayload.parse({
      meta,
      citations,
      answerText: citations.answer,
      usageAtGeneration: done.usage,
      costUsdAtGeneration: null,
    }).costUsdAtGeneration,
  ).toBeNull();
  expect(await cacheSuggested()).toBeNull();
  expect(doubles.write).toHaveBeenCalledTimes(SUGGESTED.length);
  for (const [call] of doubles.write.mock.calls)
    expect(call).toMatchObject({ payload: { costUsdAtGeneration: null } });
});
