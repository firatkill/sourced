import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { getEnv } from '@/lib/env';

const env = getEnv();
const url = env.MIGRATION_DATABASE_URL ?? env.DATABASE_URL;
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('Database reset is restricted to localhost or 127.0.0.1');
}
const sql = postgres(url, { max: 1, prepare: false });
try {
  await sql`DROP SCHEMA IF EXISTS public CASCADE`;
  await sql`DROP SCHEMA IF EXISTS drizzle CASCADE`;
  await sql`CREATE SCHEMA public`;
  await sql`CREATE SCHEMA drizzle`;
  await migrate(drizzle(sql), { migrationsFolder: './drizzle' });
  console.log('Local database reset and migrated.');
} finally {
  await sql.end();
}
