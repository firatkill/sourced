import postgres from 'postgres';
import { requireLocalDatabase } from '../helpers/local-database';

export default async function setup() {
  const sql = postgres(requireLocalDatabase(process.env.DATABASE_URL), { max: 1, prepare: false });
  try {
    const [row] = await sql<
      { name: string | null }[]
    >`SELECT to_regclass('public.rate_limits')::text AS name`;
    if (row?.name) await sql`DELETE FROM rate_limits`;
  } finally {
    await sql.end();
  }
}
