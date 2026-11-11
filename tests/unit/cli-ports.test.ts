// FR-78 / D-135: injected probes never bind host ports or contact Docker.
import { expect, test, vi } from 'vitest';
import { checkPorts } from '@/lib/cli/commands/doctor';
import { getCliEnvironment } from '@/lib/env';

const environment = () => ({
  ...getCliEnvironment(),
  SOURCED_DOCKER: '',
  DATABASE_URL: 'postgres://localhost:5433/test',
  SOURCED_PORT: '3000',
});

test.each(
  [3000, 5433].flatMap((port) =>
    ['127.0.0.1', '0.0.0.0', '::1', '::'].map((host) => ({ port, host })),
  ),
)('D-135: detects $host:$port', async ({ port, host }) => {
  const probe = vi.fn((p: number, h: string) => Promise.resolve(p !== port || h !== host));
  const result = await checkPorts(environment(), probe, () => Promise.resolve(''));
  expect(result.ok).toBe(false);
  expect(result.detail).toContain(String(port));
  expect(result.detail).toContain(host);
  expect(result.fix).toContain('SOURCED_DB_PORT');
});
test('D-135: probes both families and wildcard and loopback for configured ports', async () => {
  const probe = vi.fn(() => Promise.resolve(true));
  expect(
    (
      await checkPorts(
        { ...environment(), SOURCED_PORT: '3188', DATABASE_URL: 'postgres://localhost:5544/test' },
        probe,
      )
    ).ok,
  ).toBe(true);
  expect(probe.mock.calls).toEqual(
    [3188, 5544].flatMap((p) => ['127.0.0.1', '0.0.0.0', '::1', '::'].map((h) => [p, h])),
  );
});
test('D-135: own IPv4 container does not mask an IPv6 listener', async () => {
  const result = await checkPorts(
    environment(),
    (p) => Promise.resolve(p !== 3000),
    () => Promise.resolve('127.0.0.1:3000'),
  );
  expect(result.ok).toBe(false);
  expect(result.detail).toContain('::1');
});
test('D-135: project containers are excluded only on their mapped family and port', async () => {
  const probe = (_p: number, h: string) => Promise.resolve(h.includes(':'));
  expect(
    (
      await checkPorts(environment(), probe, (service) =>
        Promise.resolve(`127.0.0.1:${service === 'app' ? '3000' : '5433'}`),
      )
    ).ok,
  ).toBe(true);
  expect((await checkPorts(environment(), probe, () => Promise.resolve('127.0.0.1:9999'))).ok).toBe(
    false,
  );
});
test('D-135: Docker path reports not checked and does not probe container ports', async () => {
  const probe = vi.fn(() => Promise.resolve(true));
  const result = await checkPorts({ ...environment(), SOURCED_DOCKER: '1' }, probe);
  expect(result.ok).toBe(true);
  expect(result.fix).toBeUndefined();
  expect(result.detail).toContain('not checked');
  expect(result.detail).toContain('launcher reports taken ports');
  expect(probe).not.toHaveBeenCalled();
});
