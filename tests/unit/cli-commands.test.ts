import { formatEnvelope } from '@/lib/cli/output';
// T-61 / FR-78–81, D-113–114: bootstrap and diagnostic boundaries, no live calls.
import { afterEach, expect, test, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseKitConfig } from '@/lib/kit/load-config';
import { initializeEnv, saveConfig } from '@/lib/cli/commands/config-files';
import { detectSource } from '@/lib/cli/commands/add';
import { checkProviderKeys, checkDimensions } from '@/lib/cli/commands/provider-checks';
import { runInit } from '@/lib/cli/commands/init';
import { parseInvocation } from '@/lib/cli/router';
import { getCliEnvironment } from '@/lib/env';

const config = () =>
  parseKitConfig({
    schemaVersion: 1,
    corpus: { name: 'fixture', title: 'Fixture', description: 'Fixture documents', language: 'en' },
    models: {
      chat: { provider: 'openai', model: 'test-chat' },
      embed: { provider: 'openai', model: 'text-embedding-3-small', dimensions: 768 },
    },
  });
const directories: string[] = [];
async function temporary() {
  const dir = await mkdtemp(path.join(tmpdir(), 'sourced-t61-'));
  directories.push(dir);
  return dir;
}
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const dir of directories.splice(0)) await rm(dir, { recursive: true, force: true });
});
test('FR-79 / D-113: provider values remain empty; private token generated once; existing bytes preserved', async () => {
  const dir = await temporary();
  const c = { ...config(), profile: 'private' as const };
  const original = '# owner comment\nOPENAI_API_KEY="owner-test-value"\nDATABASE_URL=\n';
  await writeFile(path.join(dir, '.env.local'), original);
  const names = await initializeEnv(c, dir);
  const written = await readFile(path.join(dir, '.env.local'), 'utf8');
  expect(written.startsWith(original)).toBe(true);
  expect(written).toMatch(/SOURCED_ACCESS_TOKEN=[A-Za-z0-9_-]{32}\n/);
  expect(names).toContain('DATABASE_URL');
  expect(names).not.toContain('OPENAI_API_KEY');
  expect(names).not.toContain('SOURCED_ACCESS_TOKEN');
  await initializeEnv(c, dir);
  expect(await readFile(path.join(dir, '.env.local'), 'utf8')).toBe(written);
  const other = await temporary();
  await writeFile(path.join(other, '.env.local'), 'SOURCED_ACCESS_TOKEN=\n');
  await initializeEnv(c, other);
  expect(await readFile(path.join(other, '.env.local'), 'utf8')).toContain(
    'SOURCED_ACCESS_TOKEN=\n',
  );
  expect(await readFile(path.join(other, '.env.local'), 'utf8')).toContain('OPENAI_API_KEY=\n');
});
test('T-61 / TRD §35.3: external mounts and raw-cache ignore exceptions', async () => {
  const dir = await temporary();
  const c = parseKitConfig({
    ...config(),
    sources: [{ id: 'outside', type: 'folder', path: '/tmp/external docs', commitRaw: true }],
  });
  await saveConfig(c, dir);
  expect(await readFile(path.join(dir, '.sourced/mounts'), 'utf8')).toBe('/tmp/external docs');
  const ignored = await readFile(path.join(dir, '.gitignore'), 'utf8');
  expect(ignored).toContain('.sourced/');
  expect(ignored).toContain('corpus/*/raw/*');
  expect(ignored).toContain('!corpus/fixture/raw/outside/');
  await saveConfig({ ...c, sources: [] }, dir);
  expect(await readFile(path.join(dir, '.sourced/mounts'), 'utf8')).toBe('');
});
test('T-61: bare URL detection tries sitemap before robots and otherwise proposes crawl', async () => {
  const fetcher = vi.fn<typeof fetch>();
  fetcher.mockResolvedValueOnce(new Response('<urlset></urlset>'));
  expect((await detectSource('https://example.test/', {}, fetcher)).detected).toEqual({
    type: 'sitemap',
    sitemapUrl: 'https://example.test/sitemap.xml',
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
  fetcher
    .mockReset()
    .mockResolvedValueOnce(new Response('', { status: 404 }))
    .mockResolvedValueOnce(new Response('User-agent: *\nSitemap: https://example.test/map.xml\n'));
  expect((await detectSource('https://example.test/', {}, fetcher)).detected.sitemapUrl).toBe(
    'https://example.test/map.xml',
  );
  expect(fetcher.mock.calls.map((c) => c[0])).toEqual([
    'https://example.test/sitemap.xml',
    'https://example.test/robots.txt',
  ]);
  fetcher.mockReset().mockResolvedValue(new Response('', { status: 404 }));
  expect((await detectSource('https://example.test/', {}, fetcher)).source.type).toBe('crawl');
  fetcher.mockReset();
  expect(
    (await detectSource('/tmp/docs', { id: 'my-docs', include: '*.md,*.txt' }, fetcher)).source,
  ).toMatchObject({ type: 'folder', id: 'my-docs', include: ['*.md', '*.txt'] });
  expect(fetcher).not.toHaveBeenCalled();
});
test('FR-78: authenticated model listing uses headers; --no-network makes no requests', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(() => Promise.resolve(new Response('{}')));
  const env = {
    ...getCliEnvironment(),
    LLM_MODE: 'live' as const,
    OPENAI_API_KEY: 'test-only-key',
  };
  await checkProviderKeys(config(), env, false, fetcher);
  expect(fetcher).toHaveBeenCalledWith(
    'https://api.openai.com/v1/models',
    expect.objectContaining({ headers: { Authorization: 'Bearer test-only-key' } }),
  );
  fetcher.mockClear();
  await checkProviderKeys(config(), env, true, fetcher);
  expect(fetcher).not.toHaveBeenCalled();
  await expect(
    checkProviderKeys(config(), { ...env, OPENAI_API_KEY: undefined }, false, fetcher),
  ).rejects.toThrow('OPENAI_API_KEY');
  fetcher.mockResolvedValueOnce(new Response('', { status: 401 }));
  await expect(checkProviderKeys(config(), env, false, fetcher)).rejects.toThrow('authentication');
});
test('FR-78: mock diagnostics never contact configured live providers; dimensional mismatch fails', async () => {
  const fetcher = vi.fn<typeof fetch>();
  const env = { ...getCliEnvironment(), LLM_MODE: 'mock' as const };
  await checkProviderKeys(config(), env, false, fetcher);
  await checkDimensions(config(), env, fetcher);
  expect(fetcher).not.toHaveBeenCalled();
  fetcher.mockResolvedValueOnce(Response.json({ data: [{ embedding: [0, 1] }] }));
  await expect(checkDimensions(config(), { ...env, LLM_MODE: 'live' }, fetcher)).rejects.toThrow(
    'dimensions',
  );
});
test('FR-79: noninteractive init missing flags needs user action without writing', async () => {
  // Existing real config must be refused before any bootstrap side effect.
  const database = vi.fn();
  await expect(
    runInit(parseInvocation(['init', '--json']), { isTTY: false, progress: vi.fn() }, { database }),
  ).rejects.toMatchObject({ code: 'NEEDS_CONFIRMATION' });
  expect(database).not.toHaveBeenCalled();
});

test('FR-79: interactive init asks for configuration, never API keys; --source uses add detection', async () => {
  const dir = await temporary();
  const cwd = vi.spyOn(process, 'cwd').mockReturnValue(dir);
  const answers: Record<string, string> = {
    'corpus-name': 'fixture',
    title: 'Fixture',
    description: 'Fixture docs',
    language: 'en',
    chat: 'mock:mock',
    embed: 'mock:mock:768',
  };
  const text = vi.fn((name: string) => Promise.resolve(answers[name] ?? ''));
  const database = vi.fn().mockResolvedValue('running');
  try {
    const result = await runInit(
      parseInvocation(['init', '--source', '/tmp/documents']),
      { isTTY: true, progress: vi.fn() },
      { text, database },
    );
    expect(text.mock.calls.map((c) => c[0])).toEqual(Object.keys(answers));
    expect(database).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: [expect.objectContaining({ type: 'folder', path: '/tmp/documents' })],
      }),
    );
    expect(result.database).toBe('running');
    expect(await readFile(path.join(dir, '.env.local'), 'utf8')).not.toMatch(/API_KEY=.+/);
  } finally {
    cwd.mockRestore();
  }
});
test.each(['gemini', 'anthropic', 'ollama'] as const)(
  'FR-78: %s auth listing and unavailable Ollama model',
  async (provider) => {
    const c = config();
    c.models.chat = { provider, model: 'test-chat' };
    c.models.embed = { provider: 'mock', model: 'mock', dimensions: 768 };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ models: [{ name: 'test-chat:latest' }] }));
    const env = {
      ...getCliEnvironment(),
      LLM_MODE: 'live' as const,
      GOOGLE_GENERATIVE_AI_API_KEY: 'unit-google',
      ANTHROPIC_API_KEY: 'unit-anthropic',
    };
    await checkProviderKeys(c, env, false, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    if (provider === 'ollama') {
      fetcher.mockResolvedValueOnce(Response.json({ models: [] }));
      await expect(checkProviderKeys(c, env, false, fetcher)).rejects.toThrow('Pull');
    } else {
      const headers = fetcher.mock.calls[0]?.[1]?.headers;
      expect(headers).toMatchObject(
        provider === 'gemini'
          ? { 'x-goog-api-key': 'unit-google' }
          : { 'x-api-key': 'unit-anthropic', 'anthropic-version': '2023-06-01' },
      );
    }
  },
);

test('FR-79: inline comments on empty env values remain empty and existing lines stay untouched', async () => {
  const dir = await temporary();
  const original = 'OPENAI_API_KEY= # fill this yourself\n';
  await writeFile(path.join(dir, '.env.local'), original);
  expect(await initializeEnv(config(), dir)).toContain('OPENAI_API_KEY');
  expect((await readFile(path.join(dir, '.env.local'), 'utf8')).startsWith(original)).toBe(true);
});

test('FR-78 / FR-77: human diagnostics include every failing check and its fix', () => {
  const result = formatEnvelope(
    {
      schemaVersion: 1,
      command: 'doctor',
      ok: false,
      warnings: [],
      result: {
        checks: [
          {
            id: 'keys',
            ok: false,
            detail: 'keys check failed.',
            fix: 'Set OPENAI_API_KEY in .env.local.',
          },
        ],
      },
      error: {
        code: 'CHECKS_FAILED',
        message: 'keys: Set OPENAI_API_KEY in .env.local.',
        fix: 'Set OPENAI_API_KEY in .env.local.',
      },
    },
    false,
  );
  expect(result).toContain('keys: FAIL - keys check failed.');
  expect(result).toContain('Fix: Set OPENAI_API_KEY in .env.local.');
  expect(result.trim().split('\n').at(-1)).toBe('Next: Set OPENAI_API_KEY in .env.local.');
});
