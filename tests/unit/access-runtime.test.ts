// UT-48 / TC-238: runtime profile, process caching and unavailable-snapshot fallback.
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../../middleware';
import { getSnapshotConfig, resetKitConfigForTests } from '@/lib/kit/runtime-config';
import { configHash } from '@/lib/kit/load-config';
import { deriveCookie } from '@/lib/access/cookie';
const example = getSnapshotConfig();
const token = 'test-access-token-0000000000000000';
let directory: string;
let filename: string;
async function snapshot(profile: 'local' | 'private' | 'public-demo') {
  const config = { ...example, profile };
  await writeFile(
    filename,
    JSON.stringify({
      schemaVersion: 1,
      configHash: configHash(config),
      writtenAt: '2026-11-11T00:00:00Z',
      config,
    }),
  );
}
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'sourced-access-runtime-'));
  await mkdir(path.join(directory, '.sourced'));
  filename = path.join(directory, '.sourced/config.json');
  vi.spyOn(process, 'cwd').mockReturnValue(directory);
  vi.stubEnv('SOURCED_ACCESS_TOKEN', token);
  resetKitConfigForTests();
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetKitConfigForTests();
  await rm(directory, { recursive: true, force: true });
});
test('TC-238: middleware follows the mounted snapshot and shares process caching with routes', async () => {
  await snapshot('private');
  expect((await middleware(new NextRequest('http://localhost/api/ask'))).status).toBe(401);
  await snapshot('local');
  // No disk reads/reconfiguration on each request. Restart/reset loads the new snapshot.
  expect((await middleware(new NextRequest('http://localhost/api/ask'))).status).toBe(401);
  expect(getSnapshotConfig().profile).toBe('private');
  resetKitConfigForTests();
  expect(
    (await middleware(new NextRequest('http://localhost/api/ask'))).headers.get(
      'x-middleware-next',
    ),
  ).toBe('1');
  expect(getSnapshotConfig().profile).toBe('local');
});
test.each(['local', 'public-demo'] as const)(
  'TC-241: valid %s snapshot wins over an existing token',
  async (profile) => {
    await snapshot(profile);
    expect(
      (await middleware(new NextRequest('http://localhost/'))).headers.get('x-middleware-next'),
    ).toBe('1');
  },
);
for (const invalid of ['missing', 'json', 'schema', 'hash'] as const) {
  test.each([false, true])(`TC-238: ${invalid} snapshot, token present=%s`, async (present) => {
    if (!present) vi.stubEnv('SOURCED_ACCESS_TOKEN', '');
    if (invalid === 'json') await writeFile(filename, '{');
    if (invalid === 'schema')
      await writeFile(filename, JSON.stringify({ config: { profile: 'local' } }));
    if (invalid === 'hash')
      await writeFile(
        filename,
        JSON.stringify({
          schemaVersion: 1,
          configHash: '0'.repeat(64),
          writtenAt: '2026-11-11T00:00:00Z',
          config: example,
        }),
      );
    const headers = { cookie: `sourced_access=${await deriveCookie(token)}` };
    const api = await middleware(
      new NextRequest('http://localhost/api/ask', { method: 'POST', headers }),
    );
    expect(api.status).toBe(present ? 401 : 200);
    const page = await middleware(new NextRequest('http://localhost/eval', { headers }));
    expect(page.status).toBe(present ? 307 : 200);
    expect(page.headers.get('location')).toBe(present ? 'http://localhost/access' : null);
    expect(page.headers.get('content-security-policy')).toContain("'strict-dynamic'");
    for (const pathname of [
      '/api/health',
      '/api/access',
      '/access',
      '/_next/static/app.js',
      '/favicon.svg',
      '/api/other',
    ])
      expect(
        (await middleware(new NextRequest(`http://localhost${pathname}`))).headers.get(
          'x-middleware-next',
        ),
      ).toBe('1');
    // A failed load is not cached permanently: a repaired snapshot can recover.
    await snapshot('local');
    expect(
      (await middleware(new NextRequest('http://localhost/'))).headers.get('x-middleware-next'),
    ).toBe('1');
  });
}
test('TC-238: unrelated provider settings cannot hide a determined private profile', async () => {
  await snapshot('private');
  vi.stubEnv('LLM_MODE', 'invalid');
  expect((await middleware(new NextRequest('http://localhost/api/ask'))).status).toBe(401);
});
