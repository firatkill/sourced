// TC-190 / FR-64 / T-51: operating features are exclusive to public-demo.
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { POST } from '@/app/api/ask/route';
import * as runtime from '@/lib/kit/runtime-config';
import { isPublicDemo } from '@/lib/kit/profile';
import * as cache from '@/lib/cache/answer-cache';
import * as ip from '@/lib/ratelimit/ip';
import * as limiter from '@/lib/ratelimit/limiter';
import * as generation from '@/lib/generation/answer';
import { resetEnvForTests } from '@/lib/env';
import { SUGGESTED } from '@/lib/suggested';
import { done, meta, citations } from '../fixtures/sse-streams';

vi.mock('next/server', () => ({ after: vi.fn() }));
const originalConfig = runtime.getKitConfig();
beforeEach(() => {
  vi.spyOn(ip, 'hashVisitor').mockReturnValue('test-hash');
  vi.spyOn(limiter, 'consume').mockResolvedValue({ ok: true, day: '2026-11-10' });
  vi.spyOn(limiter, 'refund').mockResolvedValue();
  vi.spyOn(cache, 'lookupAnswerCache').mockResolvedValue(null);
  vi.spyOn(generation, 'answerQuestion').mockImplementation(({ emit }) => {
    emit({ event: 'done', data: done });
    return Promise.resolve({
      candidates: [],
      reranked: [],
      passages: [],
      retrieval: {
        ...meta.retrieval,
        candidates: [],
        reranked: [],
        passages: [],
        usage: { embeddingTokens: 0, rerankInputTokens: 0, rerankOutputTokens: 0 },
      },
      meta,
      verification: citations,
      done,
      usage: {
        embeddingTokens: 0,
        rerank: { inputTokens: 0, outputTokens: 0 },
        generation: { inputTokens: 0, outputTokens: 0 },
        fallback: { inputTokens: 0, outputTokens: 0 },
      },
      timingsMs: { ...meta.retrieval.timingsMs, ...done.latencyMs },
    });
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetEnvForTests();
});
function profile(value: 'local' | 'private' | 'public-demo') {
  vi.spyOn(runtime, 'getKitConfig').mockReturnValue({ ...originalConfig, profile: value });
}
async function ask(suggested = false) {
  const response = await POST(
    new Request('http://localhost:3000/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-real-ip': '192.0.2.1' },
      body: JSON.stringify(
        suggested
          ? { question: SUGGESTED[0]!.question, suggestedId: SUGGESTED[0]!.id }
          : { question: 'When should I use an index?' },
      ),
    }),
  );
  const body = await response.text();
  return { response, body };
}
test.each(['local', 'private', 'public-demo'] as const)('TC-190: %s feature boundary', (value) => {
  profile(value);
  expect(isPublicDemo()).toBe(value === 'public-demo');
});
for (const value of ['local', 'private'] as const) {
  test.each(['on', 'readonly', 'off'])(
    'TC-190: ' + value + ' ignores DEMO_MODE=%s and bypasses cache, hashing and quota',
    async (mode) => {
      profile(value);
      vi.stubEnv('DEMO_MODE', mode);
      resetEnvForTests();
      const { response } = await ask(true);
      expect(response.status).toBe(200);
      expect(generation.answerQuestion).toHaveBeenCalledOnce();
      expect(cache.lookupAnswerCache).not.toHaveBeenCalled();
      expect(ip.hashVisitor).not.toHaveBeenCalled();
      expect(limiter.consume).not.toHaveBeenCalled();
      expect(limiter.refund).not.toHaveBeenCalled();
    },
  );
  test('TC-190: ' + value + ' cache lookup itself is disabled', async () => {
    profile(value);
    vi.mocked(cache.lookupAnswerCache).mockRestore();
    expect(await cache.lookupAnswerCache(SUGGESTED[0]!.id)).toBeNull();
  });
}
test.each([
  ['off', 'DEMO_OFF'],
  ['readonly', 'DEMO_READONLY'],
])('TC-191: public-demo %s still gates live requests', async (mode, code) => {
  profile('public-demo');
  vi.stubEnv('DEMO_MODE', mode);
  resetEnvForTests();
  const { response, body } = await ask();
  expect(response.status).toBe(503);
  expect(body).toContain(code);
  expect(generation.answerQuestion).not.toHaveBeenCalled();
});
test('TC-191: public-demo live request hashes and consumes quota', async () => {
  profile('public-demo');
  vi.stubEnv('DEMO_MODE', 'on');
  resetEnvForTests();
  expect((await ask()).response.status).toBe(200);
  expect(ip.hashVisitor).toHaveBeenCalledOnce();
  expect(limiter.consume).toHaveBeenCalledWith('test-hash', expect.any(Date));
});
test('TC-191: public-demo replays suggested cache without quota', async () => {
  profile('public-demo');
  vi.stubEnv('DEMO_MODE', 'readonly');
  resetEnvForTests();
  vi.mocked(cache.lookupAnswerCache).mockResolvedValue({
    payload: {
      meta,
      citations,
      answerText: 'Cached answer.',
      usageAtGeneration: done.usage,
      costUsdAtGeneration: 0,
    },
    cachedAt: '2026-11-10T00:00:00.000Z',
    stale: false,
  });
  const { response, body } = await ask(true);
  expect(response.status).toBe(200);
  expect(body).toContain('"cached":true');
  expect(cache.lookupAnswerCache).toHaveBeenCalledOnce();
  expect(generation.answerQuestion).not.toHaveBeenCalled();
  expect(ip.hashVisitor).not.toHaveBeenCalled();
  expect(limiter.consume).not.toHaveBeenCalled();
});
