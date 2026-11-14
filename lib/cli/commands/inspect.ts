import { loadConfig } from '@/lib/kit/load-config';
import { inspectCorpus } from '@/lib/inspect/report';
import type { Invocation } from '../router';
import { connectDatabase } from './database';
import { requireSources } from './config-files';

export async function runInspect(input: Invocation) {
  const config = await loadConfig(process.cwd(), { writeSnapshot: false });
  requireSources(config);
  const sql = connectDatabase();
  try {
    return await inspectCorpus(
      sql,
      config,
      process.cwd(),
      typeof input.values.source === 'string' ? input.values.source : undefined,
    );
  } finally {
    await sql.end();
  }
}
