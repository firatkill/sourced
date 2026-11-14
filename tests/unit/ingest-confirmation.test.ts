// FR-73 / UT-44 / D-112
import { expect, test, vi } from 'vitest';
import { confirmIngest } from '@/lib/cli/commands/ingest';
import { getEnv, resetEnvForTests } from '@/lib/env';
const base = {
  tokens: 1_000_000,
  cost: null,
  threshold: 1,
  provider: 'openai',
  model: 'unknown',
  yes: false,
  json: false,
};
test('UT-44: unknown price needs confirmation only above one million tokens; Ollama is free', async () => {
  const ctx = { isTTY: false, progress: vi.fn() };
  await expect(confirmIngest(base, ctx)).resolves.toBeUndefined();
  await expect(confirmIngest({ ...base, tokens: 1_000_001 }, ctx)).rejects.toMatchObject({
    code: 'NEEDS_CONFIRMATION',
    message:
      'Price unknown for openai:unknown; add it to pricing in sourced.config.ts to get an estimate.',
  });
  await expect(
    confirmIngest({ ...base, tokens: 1_000_001, provider: 'ollama' }, ctx),
  ).resolves.toBeUndefined();
  await expect(
    confirmIngest({ ...base, tokens: 1_000_001, yes: true }, ctx),
  ).resolves.toBeUndefined();
});
test('UT-44: known price threshold, interactive approval/decline, JSON never prompts', async () => {
  const prompt = vi.fn().mockResolvedValue(true);
  const ctx = { isTTY: true, progress: vi.fn(), prompt };
  await confirmIngest({ ...base, cost: 1 }, ctx);
  expect(prompt).not.toHaveBeenCalled();
  await confirmIngest({ ...base, cost: 1.01 }, ctx);
  await confirmIngest({ ...base, tokens: 1_000_001 }, ctx);
  expect(prompt).toHaveBeenCalledTimes(2);
  await expect(confirmIngest({ ...base, cost: 1.01, json: true }, ctx)).rejects.toMatchObject({
    code: 'NEEDS_CONFIRMATION',
  });
  expect(prompt).toHaveBeenCalledTimes(2);
  prompt.mockResolvedValue(false);
  await expect(confirmIngest({ ...base, cost: 1.01 }, ctx)).rejects.toMatchObject({
    code: 'NEEDS_CONFIRMATION',
  });
});
test('UT-44: threshold defaults to one dollar and rejects invalid values', () => {
  vi.stubEnv('INGEST_CONFIRM_ABOVE_USD', undefined);
  resetEnvForTests();
  expect(getEnv().INGEST_CONFIRM_ABOVE_USD).toBe(1);
  vi.stubEnv('INGEST_CONFIRM_ABOVE_USD', '-1');
  resetEnvForTests();
  expect(() => getEnv()).toThrow('INGEST_CONFIRM_ABOVE_USD');
  vi.unstubAllEnvs();
  resetEnvForTests();
});
