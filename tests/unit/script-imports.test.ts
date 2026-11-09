import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, test } from 'vitest';

test('TC-078 / UT-24: server modules import under react-server with no env or DB connection', async () => {
  const { stdout, stderr } = await promisify(execFile)(
    process.execPath,
    [
      '--import',
      'tsx',
      '--conditions=react-server',
      '--input-type=module',
      '-e',
      "await import('./lib/db/client.ts'); await import('./lib/env.ts'); await import('./lib/generation/answer.ts');",
    ],
    { env: { PATH: process.env.PATH, NODE_ENV: 'test' } },
  );
  expect(stdout).toBe('');
  expect(stderr).toBe('');
});
