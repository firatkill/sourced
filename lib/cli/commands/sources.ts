import { loadConfig } from '@/lib/kit/load-config';
import { AppError } from '@/lib/errors';
import type { Invocation } from '../router';
import { connectDatabase } from './database';
import { saveConfig } from './config-files';

export async function runSources(input: Invocation) {
  const config = await loadConfig(process.cwd(), { writeSnapshot: false });
  if (input.command === 'sources list') return { sources: config.sources };
  const id = input.positionals[0];
  if (!id || !config.sources.some((s) => s.id === id))
    throw new AppError('VALIDATION_FAILED', 'Unknown source. Run pnpm sourced sources list.');
  const sql = connectDatabase();
  const next = { ...config, sources: config.sources.filter((s) => s.id !== id) };
  try {
    return await sql.begin(async (tx) => {
      const removed = await tx`DELETE FROM documents WHERE source_id=${id} RETURNING id`;
      await tx`UPDATE corpus_meta SET documents_total=(SELECT count(*) FROM documents), updated_at=now() WHERE id=1`;
      await saveConfig(next);
      return { removedDocuments: removed.length };
    });
  } finally {
    await sql.end();
  }
}
