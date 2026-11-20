import { loadConfig, parseKitConfig } from '@/lib/kit/load-config';
import { connectDatabase } from './database';
import { saveConfig } from './config-files';
import { deleteAllChats } from '@/lib/chats/store';

/**
 * D-138: replace the bundled example with an empty local configuration and delete
 * everything indexed, so a user can start from their own documents. Document files,
 * the corpus cache and evaluation files on disk are not touched; the question log and
 * rate-limit counters are kept. The router asks for confirmation first.
 * D-144: saved chats and projects are kept unless `--chats` is given.
 */
export async function runReset(options: { chats?: boolean } = {}) {
  const current = await loadConfig(process.cwd(), { writeSnapshot: false });
  const next = parseKitConfig({
    schemaVersion: 1,
    corpus: {
      name: 'my-docs',
      title: 'My documents',
      description: 'Answers from your own documents',
      language: current.corpus.language,
    },
    sources: [],
    profile: 'local',
    models: current.models,
    pricing: current.pricing,
  });
  const sql = connectDatabase();
  try {
    const removedDocuments = await sql.begin(async (tx) => {
      const [row] = await tx<{ count: number }[]>`SELECT count(*)::int AS count FROM documents`;
      await tx`TRUNCATE chunks, documents, ingest_items, ingest_runs, answer_cache CASCADE`;
      await tx`DELETE FROM corpus_meta`;
      return row?.count ?? 0;
    });
    const removedChats = options.chats ? await deleteAllChats(sql) : 0;
    await saveConfig(next);
    return { removedSources: current.sources.length, removedDocuments, removedChats };
  } finally {
    await sql.end();
  }
}
