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
        'lib/ingest/parse-html-generic.ts': { lines: 90 },
        'lib/ingest/parse-markdown.ts': { lines: 90 },
        'lib/ingest/parse-pdf.ts': { lines: 90 },
        'lib/ingest/parse-docx.ts': { lines: 90 },
        'lib/ingest/chunk.ts': { lines: 90 },
        'lib/retrieval/rrf.ts': { lines: 90 },
        'lib/generation/stream-splitter.ts': { lines: 90 },
        'lib/citations/**': { lines: 90 },
        'lib/sse/**': { lines: 90 },
        'lib/ratelimit/**': { lines: 90 },
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          globalSetup: ['./tests/setup/kit-snapshot.ts'],
          include: ['tests/unit/**/*.test.{ts,tsx}'],
          environment: 'node',
          setupFiles: ['./tests/setup/env.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          sequence: { groupOrder: 1 },
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          globalSetup: [
            './tests/setup/kit-snapshot.ts',
            './tests/setup/integration-global-setup.ts',
          ],
          setupFiles: ['./tests/setup/env.ts', './tests/setup/integration-setup.ts'],
          pool: 'forks',
          maxWorkers: 1,
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'contract',
          include: ['tests/contract/**/*.test.ts'],
          environment: 'node',
          globalSetup: [
            './tests/setup/kit-snapshot.ts',
            './tests/setup/integration-global-setup.ts',
          ],
          setupFiles: ['./tests/setup/env.ts', './tests/setup/contract-setup.ts'],
          // Keep process starts bounded and shared-database files serial. Coverage
          // runs this group after integration, which uses the same database.
          sequence: { groupOrder: 2 },
          pool: 'forks',
          maxWorkers: 1,
          fileParallelism: false,
          // Child runtimes/toolchains and DB-backed commands need startup time;
          // these are process contracts, not UI waits or unit-test timeouts.
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
