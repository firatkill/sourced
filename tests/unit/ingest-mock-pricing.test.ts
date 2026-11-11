// FR-73 / UT-44 / D-112 / D-130: rehearsal pricing uses configured models.
import { afterEach, expect, test, vi } from 'vitest';
import mongo from '../../examples/mongodb/sourced.config';
import { loadConfig, parseKitConfig } from '@/lib/kit/load-config';
import { getKitConfig, resetKitConfigForTests } from '@/lib/kit/runtime-config';
import { runIngest } from '@/lib/cli/commands/ingest';
import { parseInvocation } from '@/lib/cli/router';
import { emptyCounters } from '@/lib/cli/schemas/ingest';
import { resetEnvForTests } from '@/lib/env';

vi.mock('@/lib/kit/load-config', async (original) => ({
  ...(await original<typeof import('@/lib/kit/load-config')>()),
  loadConfig: vi.fn(),
}));
vi.mock('postgres', () => ({ default: Object.assign(() => ({ end: vi.fn() }), { BigInt: {} }) }));
vi.mock('@/lib/ingest/load', () => ({
  assertIngestAllowed: vi.fn(),
  loadCorpus: vi.fn(() => Promise.resolve({})),
}));
vi.mock('@/lib/cli/commands/ingest-report', () => ({
  planIngest: vi.fn(
    (
      _sql: unknown,
      _loaded: unknown,
      _events: unknown,
      _model: unknown,
      price: number | undefined,
    ) =>
      Promise.resolve([
        {
          ...emptyCounters(),
          id: 'docs',
          type: 'folder',
          gitRevision: null,
          skipped: [],
          embeddingTokens: 1_000_001,
          estimatedCostUsd: price === undefined ? null : (1_000_001 * price) / 1_000_000,
        },
      ]),
  ),
}));
afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvForTests();
  resetKitConfigForTests();
});
test.each([true, false])(
  'UT-44: mock ingest configured price present=%s gives live estimate and confirmation',
  async (priced) => {
    vi.stubEnv('LLM_MODE', 'mock');
    vi.stubEnv('INGEST_CONFIRM_ABOVE_USD', '0.01');
    resetEnvForTests();
    const config = parseKitConfig(mongo);
    if (!priced) config.pricing = {};
    vi.mocked(loadConfig).mockResolvedValue(config);
    const ctx = { isTTY: false, progress: vi.fn() };
    const result = await runIngest(parseInvocation(['ingest', '--dry-run']), ctx);
    expect(result.totals.estimatedCostUsd).toBe(priced ? (1_000_001 * 0.02) / 1_000_000 : null);
    expect(getKitConfig().models.embed.provider).toBe('mock');
    await expect(runIngest(parseInvocation(['ingest', '--json']), ctx)).rejects.toMatchObject({
      code: 'NEEDS_CONFIRMATION',
      ...(priced
        ? {}
        : {
            message:
              'Price unknown for openai:text-embedding-3-small; add it to pricing in sourced.config.ts to get an estimate.',
          }),
    });
  },
);
