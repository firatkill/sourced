// T-88 / R2 §6: setup mode, the one-time link and the local request checks.
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { allowSetupMode, getEnv, resetEnvForTests, setEnvConfig, setupState } from '@/lib/env';
import { allowedHosts, localDecision } from '@/lib/setup/guard';
import {
  issueSetupToken,
  readSetupToken,
  setupCookieValue,
  setupUrl,
  validSetupCookie,
  validSetupToken,
} from '@/lib/setup/token';

const roots: string[] = [];
async function root() {
  const directory = await mkdtemp(path.join(tmpdir(), 'sourced-setup-'));
  roots.push(directory);
  return directory;
}
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  setEnvConfig(undefined);
  resetEnvForTests();
  for (const directory of roots.splice(0)) await rm(directory, { recursive: true, force: true });
});

const base = {
  host: 'localhost:3000',
  origin: null,
  method: 'GET',
  path: '/',
  hasToken: false,
  setupRequired: false,
  extraHosts: new Set<string>(),
};

describe('localDecision', () => {
  it('accepts loopback hosts on any port and refuses other hosts (DNS rebinding)', () => {
    for (const host of ['localhost:3000', '127.0.0.1:3106', '[::1]:3000', 'localhost'])
      expect(localDecision({ ...base, host })).toEqual({ kind: 'allow' });
    for (const host of [
      'evil.example',
      'evil.example:3000',
      'localhost.evil.example:3000',
      '',
      null,
    ])
      expect(localDecision({ ...base, host })).toEqual({ kind: 'deny', reason: 'host' });
  });
  it('accepts a host named in ALLOWED_ORIGINS', () => {
    const extraHosts = allowedHosts('https://box.lan:8443, not a url,');
    expect([...extraHosts]).toEqual(['box.lan:8443']);
    expect(localDecision({ ...base, host: 'box.lan:8443', extraHosts })).toEqual({ kind: 'allow' });
    expect(localDecision({ ...base, host: 'box.lan', extraHosts }).kind).toBe('deny');
  });
  it('refuses a mutation whose Origin names another host; reads and origin-less calls pass', () => {
    const post = { ...base, method: 'POST', path: '/api/chats' };
    expect(localDecision({ ...post, origin: 'http://localhost:3000' }).kind).toBe('allow');
    expect(localDecision({ ...post, origin: null }).kind).toBe('allow');
    for (const origin of ['http://evil.example', 'http://localhost:3001', 'null'])
      expect(localDecision({ ...post, origin })).toEqual({ kind: 'deny', reason: 'origin' });
    expect(localDecision({ ...base, origin: 'http://evil.example' }).kind).toBe('allow');
  });
  it('exchanges the link on /setup and sends pages, not APIs or assets, to /setup', () => {
    expect(localDecision({ ...base, path: '/setup', hasToken: true }).kind).toBe('exchange');
    const pending = { ...base, setupRequired: true };
    for (const page of ['/', '/c/1', '/settings', '/eval'])
      expect(localDecision({ ...pending, path: page }).kind).toBe('setup');
    for (const free of [
      '/setup',
      '/api/ask',
      '/api/setup/key',
      '/how-it-works',
      '/_next/x.js',
      '/favicon.svg',
    ])
      expect(localDecision({ ...pending, path: free }).kind).toBe('allow');
    expect(localDecision({ ...pending, method: 'POST', origin: null }).kind).toBe('allow');
  });
});

describe('setup token', () => {
  it('writes a 48-hex-digit token with mode 0600, keeps or rotates it on request', async () => {
    const directory = await root();
    expect(readSetupToken(directory)).toBeNull();
    const first = issueSetupToken(directory, false);
    expect(first).toMatch(/^[0-9a-f]{48}$/);
    expect((await stat(path.join(directory, '.sourced/setup-token'))).mode & 0o777).toBe(0o600);
    expect(issueSetupToken(directory, false)).toBe(first);
    const second = issueSetupToken(directory);
    expect(second).not.toBe(first);
    expect(validSetupToken(first, directory)).toBe(false);
    expect(validSetupToken(second, directory)).toBe(true);
    expect(validSetupCookie(setupCookieValue(second), directory)).toBe(true);
    expect(validSetupCookie(setupCookieValue(first), directory)).toBe(false);
    expect(validSetupCookie(second, directory)).toBe(false);
    expect(setupUrl(3100, second)).toBe(`http://localhost:3100/setup?token=${second}`);
  });
  it('rejects missing and malformed tokens', async () => {
    const directory = await root();
    expect(validSetupToken('anything', directory)).toBe(false);
    expect(validSetupCookie(undefined, directory)).toBe(false);
  });
});

describe('setup mode', () => {
  const local = {
    profile: 'local',
    models: { chat: { provider: 'openai' }, embed: { provider: 'openai' } },
  };
  it('reports the missing keys of the configured providers in the local profile only', () => {
    vi.stubEnv('LLM_MODE', 'live');
    vi.stubEnv('OPENAI_API_KEY', '');
    setEnvConfig(local);
    expect(setupState()).toEqual({ required: true, missingKeys: ['OPENAI_API_KEY'] });
    vi.stubEnv('OPENAI_API_KEY', 'sk-test-present');
    expect(setupState().required).toBe(false);
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('LLM_MODE', 'mock');
    expect(setupState().required).toBe(false);
    vi.stubEnv('LLM_MODE', 'live');
    setEnvConfig({ ...local, profile: 'public-demo' });
    expect(setupState().required).toBe(false);
    setEnvConfig({
      profile: 'local',
      models: { chat: { provider: 'ollama' }, embed: { provider: 'ollama' } },
    });
    expect(setupState().required).toBe(false);
  });
  it('getEnv accepts a missing key in the local profile only after allowSetupMode', () => {
    vi.stubEnv('LLM_MODE', 'live');
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('DATABASE_URL', 'postgres://u:p@localhost:5432/db');
    setEnvConfig(local);
    expect(() => getEnv()).toThrow(/OPENAI_API_KEY/);
    vi.stubEnv('SOURCED_SETUP_MODE', '');
    allowSetupMode();
    expect(process.env.SOURCED_SETUP_MODE).toBe('1');
    expect(getEnv().OPENAI_API_KEY).toBeUndefined();
    setEnvConfig({ ...local, profile: 'private' });
    vi.stubEnv('SOURCED_ACCESS_TOKEN', 'x'.repeat(30));
    expect(() => getEnv()).toThrow(/OPENAI_API_KEY/);
  });
});

describe('middleware (local profile)', () => {
  it('refuses a foreign Host before any route runs', async () => {
    const runtime = await import('@/lib/kit/runtime-config');
    vi.spyOn(runtime, 'getSnapshotConfig').mockReturnValue({
      profile: 'local',
    } as ReturnType<typeof runtime.getSnapshotConfig>);
    vi.stubEnv('LLM_MODE', 'mock');
    const { middleware } = await import('../../middleware');
    const foreign = await middleware(
      new NextRequest('http://localhost:3000/', { headers: { host: 'rebind.example:3000' } }),
    );
    expect(foreign.status).toBe(403);
    const own = await middleware(
      new NextRequest('http://localhost:3000/', { headers: { host: 'localhost:3000' } }),
    );
    expect(own.status).toBe(200);
    const crossPost = await middleware(
      new NextRequest('http://localhost:3000/api/chats', {
        method: 'POST',
        headers: { host: 'localhost:3000', origin: 'http://evil.example' },
      }),
    );
    expect(crossPost.status).toBe(403);
  });
  it('exchanges a valid link for an HttpOnly SameSite=Strict cookie and drops the token from the URL', async () => {
    const directory = await root();
    const token = issueSetupToken(directory);
    vi.spyOn(process, 'cwd').mockReturnValue(directory);
    const runtime = await import('@/lib/kit/runtime-config');
    vi.spyOn(runtime, 'getSnapshotConfig').mockReturnValue({
      profile: 'local',
    } as ReturnType<typeof runtime.getSnapshotConfig>);
    vi.stubEnv('LLM_MODE', 'mock');
    const { middleware } = await import('../../middleware');
    const ok = await middleware(
      new NextRequest(`http://localhost:3000/setup?token=${token}`, {
        headers: { host: 'localhost:3000' },
      }),
    );
    expect(ok.status).toBe(307);
    expect(ok.headers.get('location')).toBe('http://localhost:3000/setup');
    const cookie = ok.headers.get('set-cookie') ?? '';
    expect(cookie).toContain(`sourced_setup=${setupCookieValue(token)}`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=strict/i);
    expect(cookie).not.toContain(token);
    const stale = await middleware(
      new NextRequest(`http://localhost:3000/setup?token=${'0'.repeat(48)}`, {
        headers: { host: 'localhost:3000' },
      }),
    );
    expect(stale.headers.get('location')).toBe('http://localhost:3000/setup?link=expired');
    expect(stale.headers.get('set-cookie')).toBeNull();
  });
});
