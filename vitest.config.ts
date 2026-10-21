import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

try {
  process.loadEnvFile('.env.local');
} catch {
  /* CI supplies its environment. */
}

export default defineConfig({
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- retained as required by TRD §2
  esbuild: { jsx: 'automatic' },
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
      'server-only': fileURLToPath(new URL('./tests/setup/empty.ts', import.meta.url)),
    },
  },
  test: {
    coverage: {
      provider: 'v8',
      include: ['lib/**'],
      exclude: [
        'lib/llm/openai.ts',
        'lib/db/client.ts',
        'lib/logger.ts',
        'lib/eval/load-results.ts',
      ],
      // T-17 enables the global floor; critical files retain their stricter floor.
      thresholds: {
        autoUpdate: false,
        lines: 80,
        'lib/ingest/chunk.ts': { lines: 90 },
        'lib/retrieval/rrf.ts': { lines: 90 },
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.{ts,tsx}'],
          environment: 'node',
          setupFiles: ['./tests/setup/env.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          globalSetup: ['./tests/setup/integration-global-setup.ts'],
          setupFiles: ['./tests/setup/env.ts', './tests/setup/integration-setup.ts'],
          pool: 'forks',
          maxWorkers: 1,
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
