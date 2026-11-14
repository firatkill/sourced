// D-119, D-120 / FR-59, FR-63: safe diagnostics and runtime corpus copy.
import { afterEach, expect, test, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { EnvironmentError } from '@/lib/env';
import { readAppConfiguration } from '@/lib/kit/app-configuration';
import { ConfigurationError } from '@/components/layout/ConfigurationError';
import { getRuntimeCopy } from '@/lib/kit/copy-server';
import * as runtime from '@/lib/kit/runtime-config';
import { KitConfigSchema } from '@/lib/kit/config-schema';
import example from '@/sourced.config';
import Home from '@/app/page';
import How from '@/app/how-it-works/page';
import Evaluation from '@/app/eval/page';
const env = vi.hoisted(() => vi.fn());
vi.mock('@/lib/env', async (original) => ({
  ...(await original<typeof import('@/lib/env')>()),
  getEnv: env,
}));
afterEach(() => {
  vi.restoreAllMocks();
  env.mockReset();
});
test('configuration page renders approved copy and variable fixes without values or stacks', () => {
  env.mockImplementation(() => {
    throw new EnvironmentError(['OPENAI_API_KEY', 'QUESTION_HASH_SALT']);
  });
  const result = readAppConfiguration();
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('Expected configuration failure');
  const html = renderToStaticMarkup(<ConfigurationError fixes={result.fixes} />);
  expect(html).toContain('Sourced needs configuration');
  expect(html).toContain('Fix the settings below in .env.local, then restart Sourced.');
  expect(html).toContain('Set OPENAI_API_KEY to your provider key in .env.local.');
  expect(html).toContain('QUESTION_HASH_SALT');
  expect(html).not.toContain('EnvironmentError');
  expect(html).not.toMatch(/at \w+ \(.*:\d+:\d+\)/);
});
test('runtime copy reads the current snapshot instead of a build constant', () => {
  const config = KitConfigSchema.parse(example);
  vi.spyOn(runtime, 'getKitConfig').mockImplementation(() => config);
  expect(getRuntimeCopy().hero).toBe('Ask the PostgreSQL docs.');
  config.copy.hero = 'Ask the updated runtime docs.';
  expect(getRuntimeCopy().hero).toBe('Ask the updated runtime docs.');
});

test('D-119: every page returns safe diagnostics before loading runtime data', async () => {
  env.mockImplementation(() => {
    throw new EnvironmentError(['OPENAI_API_KEY']);
  });
  for (const page of [Home, How, Evaluation]) {
    const html = renderToStaticMarkup(await page());
    expect(html).toContain('Sourced needs configuration');
    expect(html).toContain('OPENAI_API_KEY');
  }
});
