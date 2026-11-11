import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
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
/** Read the checked-in local service without needing a running Docker daemon. */
export async function localDatabaseUrl(): Promise<string> {
  const compose = await readFile(`${repositoryRoot}/docker-compose.yml`, 'utf8');
  const db = compose.split('  db:')[1]?.split(/\n  [a-z][a-z-]*:/)[0] ?? '';
  const setting = (name: string) =>
    db.match(new RegExp(`^\\s+${name}: ['"]?([^'"\\s]+)`, 'm'))?.[1];
  const port = db.match(/['"](?:127\.0\.0\.1:)?(\d+):5432['"]/)?.[1];
  const user = setting('POSTGRES_USER');
  const password = setting('POSTGRES_PASSWORD');
  const database = setting('POSTGRES_DB');
  if (!user || !password || !database || !port)
    throw new AppError(
      'INTERNAL_ERROR',
      'Could not read the local database settings from docker-compose.yml. Check the db service.',
    );
  return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@localhost:${port}/${encodeURIComponent(database)}`;
}
export async function initializeDatabase(
  config: KitConfig,
): Promise<'started' | 'running' | 'external'> {
  const env = getCliEnvironment();
  const url = env.MIGRATION_DATABASE_URL ?? env.DATABASE_URL ?? (await localDatabaseUrl());
  let local: boolean;
  try {
    local = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname);
  } catch {
    throw new AppError(
      'NEEDS_CONFIRMATION',
      'DATABASE_URL or MIGRATION_DATABASE_URL is invalid. Set a database connection URL in .env.local.',
    );
  }
  let status: 'started' | 'running' | 'external' = local ? 'running' : 'external';
  // A CI service database is already reachable even though no Compose project exists.
  const probe = connectDatabase(url);
  let reachable = false;
  try {
    await probe`SELECT 1`;
    reachable = true;
  } catch {
    /* Start only an unavailable local service. */
  } finally {
    await probe.end();
  }
  if (!reachable) {
    if (!local)
      throw new AppError(
        'NEEDS_CONFIRMATION',
        'Database connection failed. Check DATABASE_URL or MIGRATION_DATABASE_URL and database availability.',
      );
    try {
      await execute('docker', ['compose', 'up', '-d', '--wait', 'db'], { cwd: repositoryRoot });
      status = 'started';
    } catch (cause) {
      throw new AppError(
        'INTERNAL_ERROR',
        'Could not start the local database. Check Docker and run docker compose up -d --wait db.',
        { cause },
      );
    }
  }
  const sql = connectDatabase(url);
  try {
    try {
      await migrate(drizzle(sql), { migrationsFolder: `${repositoryRoot}/drizzle` });
    } catch (cause) {
      throw new AppError(
        'INTERNAL_ERROR',
        'Database migrations failed. Check DATABASE_URL or MIGRATION_DATABASE_URL, database availability and migration permissions.',
        { cause },
      );
    }
    await ensureCorpusSchema(sql, config);
  } finally {
    await sql.end();
  }
  return status;
}
