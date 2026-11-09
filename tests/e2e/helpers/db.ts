import postgres from 'postgres';
import { requireLocalDatabase } from '../../helpers/local-database';

// E2E-12 only: preserve the exact prior global row, including an absent row.
export async function withGlobalCap(run: () => Promise<void>) {
  const sql = postgres(requireLocalDatabase(process.env.DATABASE_URL), { max: 1, prepare: false });
  const day = new Date().toISOString().slice(0, 10);
  try {
    const [previous] = await sql<{ count: number }[]>`
      SELECT count FROM rate_limits WHERE bucket = 'global' AND window_start = ${day}::date`;
    try {
      await sql`INSERT INTO rate_limits (bucket, window_start, count) VALUES ('global', ${day}::date, 1000)
        ON CONFLICT (bucket, window_start) DO UPDATE SET count = EXCLUDED.count`;
      await run();
    } finally {
      if (previous) {
        await sql`UPDATE rate_limits SET count = ${previous.count}
          WHERE bucket = 'global' AND window_start = ${day}::date`;
      } else {
        await sql`DELETE FROM rate_limits WHERE bucket = 'global' AND window_start = ${day}::date`;
      }
    }
  } finally {
    await sql.end();
  }
}
