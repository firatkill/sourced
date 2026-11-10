import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { getCliEnvironment } from '@/lib/env';
import type { KitConfig } from '@/lib/kit/config-schema';
import { ensureCorpusSchema } from '@/lib/kit/vector-schema';
import { AppError } from '@/lib/errors';

export const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
export const execute = promisify(execFile);
export function connectDatabase(url = getCliEnvironment().DATABASE_URL) {
  if (!url) throw new AppError('NEEDS_CONFIRMATION', 'Set DATABASE_URL in .env.local.');
  return postgres(url, {
    prepare: false,
    max: 1,
    connect_timeout: 5,
    types: { bigint: postgres.BigInt },
  });
}
export async function migrationStatus(sql: postgres.Sql) {
  const expected = readMigrationFiles({ migrationsFolder: `${repositoryRoot}/drizzle` });
  const applied = await sql<{ hash: string }[]>`SELECT hash FROM drizzle.__drizzle_migrations`;
  return expected.every((m) => applied.some((a) => a.hash === m.hash));
}
export async function initializeDatabase(
  config: KitConfig,
): Promise<'started' | 'running' | 'external'> {
  const env = getCliEnvironment();
  const url = env.MIGRATION_DATABASE_URL ?? env.DATABASE_URL;
  // The Node path uses the repository's db:up service; no credentials are persisted.
  const local = !url || ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname);
  let status: 'started' | 'running' | 'external' = 'external';
  if (local) {
    const { stdout } = await execute(
      'docker',
      ['compose', 'ps', '--status', 'running', '-q', 'db'],
      { cwd: repositoryRoot },
    );
    status = stdout.trim() ? 'running' : 'started';
    if (status === 'started') await execute('pnpm', ['db:up'], { cwd: repositoryRoot });
  }
  const sql = connectDatabase(url ?? 'postgres://sourced:sourced@localhost:5433/sourced');
  try {
    await migrate(drizzle(sql), { migrationsFolder: `${repositoryRoot}/drizzle` });
    await ensureCorpusSchema(sql, config);
  } finally {
    await sql.end();
  }
  return status;
}
