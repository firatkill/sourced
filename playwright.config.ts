import { defineConfig, devices } from '@playwright/test';

// Local runs: load .env.local (DATABASE_URL etc.) so the DB helpers and global setup see the same database
// as `next start`. Existing env vars win. In CI the file does not exist and the workflow env is used.
try {
  process.loadEnvFile('.env.local');
} catch {
  // no .env.local
}

const baseEnv = Object.fromEntries(
  Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string'),
);
const server = (port: number, extra: Record<string, string>) => ({
  // eslint-disable-next-line @typescript-eslint/restrict-template-expressions -- normative TRD §23.4 numeric port
  command: `pnpm exec next start -p ${port}`,
  // eslint-disable-next-line @typescript-eslint/restrict-template-expressions -- normative TRD §23.4 numeric port
  url: `http://localhost:${port}`,
  reuseExistingServer: !process.env.CI,
  timeout: 120_000,
  env: {
    ...baseEnv,
    LLM_MODE: 'mock',
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions -- normative TRD §23.4 numeric port
    NEXT_PUBLIC_SITE_URL: `http://localhost:${port}`,
    RATE_LIMIT_IP_DAILY: '3',
    RATE_LIMIT_GLOBAL_DAILY: '1000',
    EVAL_RESULTS_DIR: 'tests/fixtures/eval-results',
    MOCK_STREAM_DELAY_MS: '5',
    ...extra,
  },
});

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  timeout: 90_000,
  expect: { timeout: 3000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  projects: [
    { name: 'parallel', grepInvert: /@isolated/, fullyParallel: true },
    {
      name: 'isolated',
      grep: /@isolated/,
      fullyParallel: false,
      workers: 1,
      dependencies: ['parallel'],
    },
  ],
  webServer: [
    server(3100, { DEMO_MODE: 'on' }),
    server(3101, { DEMO_MODE: 'readonly' }),
    server(3102, { DEMO_MODE: 'off' }),
  ],
});
