// T-99 / D-152: `sourced docling on|off|status` with the Docker work stubbed out.
/* eslint-disable @typescript-eslint/require-await -- the fakes stand in for async APIs */
import { afterEach, describe, expect, test, vi } from 'vitest';
import { formatEnvelope } from '@/lib/cli/output';
import { parseInvocation } from '@/lib/cli/router';
import { parseKitConfig } from '@/lib/kit/load-config';
import type { KitConfig } from '@/lib/kit/config-schema';

const state = vi.hoisted(() => ({
  config: undefined as KitConfig | undefined,
  saved: [] as KitConfig[],
  service: 'ready',
}));
vi.mock('@/lib/kit/load-config', async (original) => ({
  ...(await original<typeof import('@/lib/kit/load-config')>()),
  loadConfig: vi.fn(async () => structuredClone(state.config)),
}));
vi.mock('@/lib/cli/commands/config-files', async (original) => ({
  ...(await original<typeof import('@/lib/cli/commands/config-files')>()),
  saveConfig: vi.fn(async (config: KitConfig) => {
    state.saved.push(structuredClone(config));
  }),
}));
vi.mock('@/lib/ingest/docling', async (original) => ({
  ...(await original<typeof import('@/lib/ingest/docling')>()),
  doclingStatus: vi.fn(async () => state.service),
}));

const base = (parsing?: { engine: 'builtin' | 'docling' }) =>
  parseKitConfig({
    schemaVersion: 1,
    corpus: { name: 'fixture', title: 'Fixture', description: 'Fixture documents', language: 'en' },
    models: {
      chat: { provider: 'openai', model: 'test-chat' },
      embed: { provider: 'openai', model: 'text-embedding-3-small', dimensions: 768 },
    },
    ...(parsing ? { parsing } : {}),
  });
const context = { progress: () => undefined, isTTY: false };

afterEach(() => {
  vi.unstubAllEnvs();
  state.saved = [];
  state.service = 'ready';
});

describe('T-99: docling command', () => {
  test('parses on, off and status as subcommands', () => {
    expect(parseInvocation(['docling', 'on', '--json'])).toMatchObject({
      command: 'docling on',
      json: true,
    });
    expect(parseInvocation(['docling', 'status']).command).toBe('docling status');
    expect(() => parseInvocation(['docling', 'maybe'])).toThrow('Choose a registered command.');
  });

  test('on records Docling in the configuration and reports it running', async () => {
    vi.stubEnv('SOURCED_DOCKER', '1'); // The launcher already started the container.
    state.config = base();
    const { runDocling } = await import('@/lib/cli/commands/docling');
    const result = await runDocling('on', context);
    expect(result).toMatchObject({ engine: 'docling', service: 'ready', changed: true });
    expect(state.saved.at(-1)?.parsing).toEqual({ engine: 'docling' });
  });

  test('on again changes nothing', async () => {
    vi.stubEnv('SOURCED_DOCKER', '1');
    state.config = base({ engine: 'docling' });
    const { runDocling } = await import('@/lib/cli/commands/docling');
    expect(await runDocling('on', context)).toMatchObject({ changed: false });
    expect(state.saved).toEqual([]);
  });

  test('off removes the key, so the configuration reads as before v2.5', async () => {
    vi.stubEnv('SOURCED_DOCKER', '1');
    state.config = base({ engine: 'docling' });
    state.service = 'off';
    const { runDocling } = await import('@/lib/cli/commands/docling');
    expect(await runDocling('off', context)).toMatchObject({ engine: 'builtin', changed: true });
    expect(state.saved.at(-1)).not.toHaveProperty('parsing');
  });

  test('status reads the configuration and the service without writing', async () => {
    state.config = base();
    state.service = 'off';
    const { runDocling } = await import('@/lib/cli/commands/docling');
    expect(await runDocling('status', context)).toMatchObject({
      engine: 'builtin',
      service: 'off',
      changed: false,
    });
    expect(state.saved).toEqual([]);
  });

  test('human output says which reader is used and what to run next', () => {
    const envelope = (result: object) => ({
      schemaVersion: 1 as const,
      command: 'docling on',
      ok: true as const,
      result: { image: 'docling', ...result },
      warnings: [],
    });
    expect(
      formatEnvelope(envelope({ engine: 'docling', service: 'ready', changed: true }), false),
    ).toBe(
      'PDF, Word and PowerPoint files are read with Docling.\nDocling is running.\nNext: pnpm sourced ingest (reads those files again; only changed passages are embedded again)\n',
    );
    expect(
      formatEnvelope(envelope({ engine: 'docling', service: 'off', changed: false }), false),
    ).toContain('Next: pnpm sourced docling on\n');
  });
});
