import 'server-only';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { getEnv } from '@/lib/env';
import * as schema from './schema';

let client: postgres.Sql | undefined;

export function getSql(): postgres.Sql {
  if (!client) {
    const env = getEnv();
    client = postgres(env.DATABASE_URL, {
      max: env.DATABASE_POOL_MAX,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false, // required behind Supabase's Supavisor pooler (transaction mode, port 6543)
      types: { bigint: postgres.BigInt },
    });
  }
  return client;
}

export function getDb() {
  return drizzle(getSql(), { schema });
}

/** Tests only (IT-10 and suites that switch URLs): end the pool and forget it so the next getSql() reconnects. */
export async function closeSqlForTests(): Promise<void> {
  if (client) await client.end({ timeout: 5 });
  client = undefined;
}
