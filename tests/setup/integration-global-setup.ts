import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { requireLocalDatabase } from '../helpers/local-database';

export default async function setup() {
  const url = requireLocalDatabase(process.env.TEST_DATABASE_URL);
  const sql = postgres(url, { max: 1, prepare: false });
  try {
    await migrate(drizzle(sql), { migrationsFolder: './drizzle' });
  } finally {
    await sql.end();
  }
}
