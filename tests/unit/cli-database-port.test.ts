// FR-79 / D-135: Node initialization follows the configurable Compose host port.
import { afterEach, expect, test, vi } from 'vitest';
import { localDatabaseUrl } from '@/lib/cli/commands/database';
afterEach(() => vi.unstubAllEnvs());
test('D-135: local database URL retains the default and uses the configured host port', async () => {
  vi.stubEnv('SOURCED_DB_PORT', '');
  expect(new URL(await localDatabaseUrl()).port).toBe('5433');
  vi.stubEnv('SOURCED_DB_PORT', '5544');
  expect(new URL(await localDatabaseUrl()).port).toBe('5544');
});
