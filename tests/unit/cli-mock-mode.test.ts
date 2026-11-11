// FR-73 / FR-89 / TRD §34: mode disclosure without any provider calls.
import { afterEach, expect, test, vi } from 'vitest';
import { dispatch } from '@/lib/cli/router';
import { emptyCounters } from '@/lib/cli/schemas/ingest';

afterEach(() => vi.unstubAllEnvs());
const warning = {
  code: 'MOCK_MODE',
  message: 'Mock mode: no provider is called; embeddings and answers are stand-ins.',
};
const cases = [
  { args: ['doctor'], result: { checks: [] } },
  {
    args: ['ingest'],
    result: {
      mode: 'dry-run',
      runId: null,
      corpusVersion: null,
      sources: [],
      totals: emptyCounters(),
    },
  },
  { args: ['ask', 'Question?'], result: { outcome: 'not_found', answer: '', citations: [] } },
  { args: ['eval:generate'], result: { written: 0, costUsd: null } },
  { args: ['eval', '--validate-only'], result: undefined },
];
test.each(cases)(
  'TRD §34: $args discloses mock mode exactly once and preserves other warnings',
  async ({ args, result }) => {
    const existing = { code: 'OTHER', message: 'Existing warning' };
    for (const mode of ['mock', 'live']) {
      vi.stubEnv('LLM_MODE', mode);
      const response = await dispatch(args, { isTTY: false, progress: vi.fn() }, () =>
        Promise.resolve({
          result,
          warnings: [existing],
        }),
      );
      expect(response.exitCode).toBe(0);
      expect(response.envelope.warnings).toEqual(
        mode === 'mock' ? [existing, warning] : [existing],
      );
    }
  },
);
test('TRD §34: failed doctor checks still disclose mock mode; unrelated commands do not', async () => {
  vi.stubEnv('LLM_MODE', 'mock');
  const context = { isTTY: false, progress: vi.fn() };
  const doctor = await dispatch(['doctor'], context, () =>
    Promise.resolve({
      result: { checks: [{ id: 'db', ok: false, detail: 'Unavailable' }] },
    }),
  );
  expect(doctor.exitCode).toBe(2);
  expect(doctor.envelope.warnings).toEqual([warning]);
  const sources = await dispatch(['sources', 'list'], context, () =>
    Promise.resolve({
      result: { sources: [] },
    }),
  );
  expect(sources.envelope.warnings).toEqual([]);
});
