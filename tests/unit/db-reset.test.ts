import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('TC-013: T-04 refuses reset against a non-local host before connecting', () => {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', '--conditions=react-server', 'scripts/db-reset.ts'],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        DATABASE_URL: 'postgres://example.invalid/sourced',
        MIGRATION_DATABASE_URL: 'postgres://example.invalid/sourced',
      },
    },
  );
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('Database reset is restricted to localhost or 127.0.0.1');
});
