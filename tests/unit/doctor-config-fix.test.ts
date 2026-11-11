// Task 64 / FR-78: config check fixes use the active launcher, without live calls.
import { afterEach, expect, test, vi } from 'vitest';
import { runDoctor } from '@/lib/cli/commands/doctor';
import { parseInvocation } from '@/lib/cli/router';

vi.mock('@/lib/kit/load-config', async (original) => ({
  ...(await original<typeof import('@/lib/kit/load-config')>()),
  loadConfig: vi.fn().mockRejectedValue(new Error('Invalid configuration')),
}));
vi.mock('@/lib/cli/commands/database', () => ({
  repositoryRoot: process.cwd(),
  execute: vi.fn().mockResolvedValue({ stdout: '10.18.3' }),
  connectDatabase: vi.fn(),
  migrationStatus: vi.fn(),
}));
vi.mock('node:net', () => ({
  createServer: () => ({
    once: vi.fn(),
    listen(_options: unknown, ready: () => void) {
      ready();
    },
    close(done: () => void) {
      done();
    },
  }),
}));
afterEach(() => vi.unstubAllEnvs());
test.each([
  ['1', './sourced'],
  [undefined, 'pnpm sourced'],
])('Task 64: doctor config fix for container marker %s', async (docker, command) => {
  vi.stubEnv('SOURCED_DOCKER', docker);
  const result = await runDoctor(parseInvocation(['doctor', '--no-network']));
  expect(result.result).toMatchObject({
    checks: expect.arrayContaining([
      expect.objectContaining({
        id: 'config',
        ok: false,
        fix: `Edit sourced.config.ts and run ${command} config:snapshot.`,
      }),
    ]) as unknown,
  });
});
