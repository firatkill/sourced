import { beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { requireLocalDatabase } from '../helpers/local-database';
import { closeSqlForTests } from '@/lib/db/client';
import { resetEnvForTests } from '@/lib/env';

const databaseUrl = requireLocalDatabase(process.env.TEST_DATABASE_URL);
process.env.DATABASE_URL = databaseUrl;
resetEnvForTests();
beforeAll(async () => {
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    const tables = await sql<
      { tablename: string }[]
    >`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
    for (const table of tables) {
      await sql`TRUNCATE TABLE ${sql(table.tablename)} RESTART IDENTITY CASCADE`;
    }
  } finally {
    await sql.end();
  }
});
afterAll(async () => {
  await closeSqlForTests();
});
