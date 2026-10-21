import { expect, test, vi } from 'vitest';
import { embedBatches } from '@/lib/ingest/embed-batch';
import { EMBEDDING } from '@/lib/config';
import { featureHash } from '@/lib/llm/feature-hash';

const response = (values: string[]) => ({
  vectors: values.map((value) => featureHash(value).vector),
  tokens: values.length,
});
test('TC-043: batches at 100 with two concurrent calls preserve input order and usage', async () => {
  const inputs = Array.from({ length: 205 }, (_, index) => `input ${String(index)}`);
  let active = 0;
  let peak = 0;
  let release: (() => void) | undefined;
  const first = new Promise<void>((resolve) => {
    release = resolve;
  });
  const embed = vi.fn(async (values: string[], opts?: { abortSignal?: AbortSignal }) => {
    active++;
    peak = Math.max(active, peak);
    expect(values.length).toBeLessThanOrEqual(EMBEDDING.BATCH_SIZE);
    expect(opts?.abortSignal).toBeInstanceOf(AbortSignal);
    if (values[0] === inputs[0]) await first;
    else release?.();
    active--;
    return response(values);
  });
  const result = await embedBatches(inputs, { provider: { embed } });
  expect(peak).toBe(EMBEDDING.CONCURRENCY);
  expect(embed.mock.calls.map(([values]) => values.length)).toEqual([100, 100, 5]);
  expect(result).toEqual(response(inputs));
  expect(await embedBatches([], { provider: { embed } })).toEqual({ vectors: [], tokens: 0 });
  expect(embed).toHaveBeenCalledTimes(3);
});

test('TC-044: retry 429, 5xx, network and timeout with bounded jitter and Retry-After', async () => {
  const sleep = vi.fn(() => Promise.resolve());
  const embed = vi
    .fn()
    .mockRejectedValueOnce({ statusCode: 429, responseHeaders: { 'retry-after': '7' } })
    .mockRejectedValueOnce({ statusCode: 503 })
    .mockRejectedValueOnce(new TypeError('network'))
    .mockRejectedValueOnce(new DOMException('timeout', 'TimeoutError'))
    .mockResolvedValue(response(['one']));
  await expect(
    embedBatches(['one'], { provider: { embed }, sleep, random: () => 0 }),
  ).resolves.toEqual(response(['one']));
  expect(sleep.mock.calls).toEqual([[7000], [1000], [2000], [4000]]);
  const exhausted = vi.fn().mockRejectedValue({ statusCode: 500 });
  sleep.mockClear();
  await expect(
    embedBatches(['one'], { provider: { embed: exhausted }, sleep, random: () => 1 }),
  ).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
  expect(exhausted).toHaveBeenCalledTimes(EMBEDDING.MAX_RETRIES + 1);
  expect(sleep.mock.calls).toEqual([[1000], [2000], [4000], [8000], [16000]]);
});

test('TC-044: HTTP-date Retry-After is respected; other 4xx fail immediately', async () => {
  const now = Date.UTC(2026, 9, 21);
  const sleep = vi.fn(() => Promise.resolve());
  const embed = vi
    .fn()
    .mockRejectedValueOnce({
      statusCode: 429,
      responseHeaders: { 'retry-after': new Date(now + 9000).toUTCString() },
    })
    .mockResolvedValue(response(['one']));
  await embedBatches(['one'], { provider: { embed }, sleep, now: () => now, random: () => 0 });
  expect(sleep.mock.calls).toEqual([[9000]]);
  for (const statusCode of [400, 401, 403, 404]) {
    const reject = vi.fn().mockRejectedValue({ statusCode });
    sleep.mockClear();
    await expect(
      embedBatches(['one'], { provider: { embed: reject }, sleep }),
    ).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
    expect(reject).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  }
});

test('TC-043: malformed dimensions, nonfinite values and vector count fail without retry', async () => {
  for (const vectors of [
    [[1]],
    [Array<number>(EMBEDDING.DIMENSIONS).fill(NaN)],
    [Array<number>(EMBEDDING.DIMENSIONS).fill(Infinity)],
    [],
  ]) {
    const embed = vi.fn().mockResolvedValue({ vectors, tokens: 1 });
    const sleep = vi.fn(() => Promise.resolve());
    await expect(embedBatches(['one'], { provider: { embed }, sleep })).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
    });
    expect(embed).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  }
});
