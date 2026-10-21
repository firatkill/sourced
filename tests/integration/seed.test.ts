import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, test } from 'vitest';
import { getSql } from '@/lib/db/client';
import { EMBEDDING } from '@/lib/config';
import { requireLocalDatabase } from '../helpers/local-database';

test('TC-052: T-16 offline mock seed produces more than 200 chunks, excludes fixtures and reports exact totals', async () => {
  const databaseUrl = requireLocalDatabase(process.env.TEST_DATABASE_URL);
  const { stdout } = await promisify(execFile)(
    process.execPath,
    ['--import', 'tsx', '--conditions=react-server', 'scripts/seed.ts'],
    {
      env: {
        ...process.env,
        LLM_MODE: 'mock',
        OPENAI_API_KEY: '',
        DATABASE_URL: databaseUrl,
        MIGRATION_DATABASE_URL: databaseUrl,
      },
    },
  );
  const [row] = await getSql()<{ count: number; models: string[]; fixtures: number }[]>`
    SELECT count(*)::int AS count,array_agg(DISTINCT c.embedding_model) AS models,
      count(*) FILTER (WHERE d.is_fixture)::int AS fixtures
    FROM chunks c JOIN documents d ON d.id=c.document_id`;
  expect(row?.count).toBeGreaterThan(200);
  expect(row?.models).toEqual([EMBEDDING.MOCK_MODEL]);
  expect(row?.fixtures).toBe(0);
  expect(stdout).toContain(`chunks      ${String(row?.count)} total`);
  expect(stdout).toContain('(fixtures: no)');
  expect(stdout).toContain('est. $0.0000');
});
