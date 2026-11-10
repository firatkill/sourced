/** T-59 manual CLI check: send a real SIGINT after the first committed document. */
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { getKitConfig } from '../../lib/kit/runtime-config';
import { SourceSchema } from '../../lib/kit/config-schema';
import { requireLocalDatabase } from './local-database';

const root = process.cwd();
const directory = await mkdtemp(join(root, 'tests/fixtures/.t59-cli-'));
const config = getKitConfig(false);
config.sources = [
  SourceSchema.parse({ id: 'mixed', type: 'folder', path: resolve('tests/fixtures/mixed-folder') }),
];
await writeFile(
  join(directory, 'sourced.config.ts'),
  `export default ${JSON.stringify(config)};\n`,
);
const url = new URL(requireLocalDatabase(process.env.DATABASE_URL));
url.pathname = `/sourced_t59_cli_${String(Date.now())}`;
url.search = '';
url.hash = '';
const adminUrl = new URL(url);
adminUrl.pathname = '/postgres';
const admin = postgres(adminUrl.href, { prepare: false, onnotice: () => {} });
try {
  await admin`CREATE DATABASE ${admin(url.pathname.slice(1))}`;
} finally {
  await admin.end();
}
const sql = postgres(url.href, { prepare: false, onnotice: () => {} });
const loader = createRequire(import.meta.url).resolve('tsx');
async function command(interrupt: boolean) {
  return new Promise<{ code: number | null; output: string; progress: string }>(
    (resolveResult, reject) => {
      const child = spawn(
        process.execPath,
        [
          '--import',
          loader,
          '--conditions=react-server',
          resolve(root, 'scripts/sourced.ts'),
          'ingest',
          '--offline',
          '--yes',
          '--json',
        ],
        {
          cwd: directory,
          env: {
            ...process.env,
            LLM_MODE: 'mock',
            DATABASE_URL: url.href,
            MIGRATION_DATABASE_URL: '',
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      let output = '';
      let progress = '';
      let sent = false;
      child.stdout.on('data', (data: Buffer) => {
        output += data.toString();
      });
      child.stderr.on('data', (data: Buffer) => {
        progress += data.toString();
        if (interrupt && !sent && /1\/6 documents done/.test(progress)) {
          sent = true;
          child.kill('SIGINT');
        }
      });
      child.on('error', reject);
      child.on('close', (code) => {
        resolveResult({ code, output, progress });
      });
    },
  );
}
try {
  await migrate(drizzle(sql), { migrationsFolder: 'drizzle' });
  // A deterministic slow local write gives the human-eye SIGINT check an in-flight transaction.
  await sql`CREATE FUNCTION t59_delay() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.5); RETURN NEW; END $$`;
  await sql`CREATE TRIGGER t59_delay BEFORE INSERT ON documents FOR EACH ROW EXECUTE FUNCTION t59_delay()`;
  const interrupted = await command(true);
  const [partial] =
    await sql`SELECT status,error,corpus_version,documents_changed,chunks_inserted,embedding_tokens FROM ingest_runs ORDER BY id DESC LIMIT 1`;
  process.stdout.write(JSON.stringify({ interruptedExit: interrupted.code, partial }) + '\n');
  if (interrupted.code !== 130 || partial?.error !== 'interrupted')
    throw new Error('CLI failed to drain on SIGINT.');
  const resumed = await command(false);
  const [complete] =
    await sql`SELECT status,error,documents_total,documents_changed,chunks_inserted,embedding_tokens,corpus_version FROM ingest_runs ORDER BY id DESC LIMIT 1`;
  process.stdout.write(JSON.stringify({ resumedExit: resumed.code, complete }) + '\n');
  if (
    resumed.code !== 0 ||
    complete?.documents_total !== 6 ||
    complete.chunks_inserted !== 7 ||
    complete.embedding_tokens !== 177
  )
    throw new Error('CLI resume differs from the uninterrupted mixed-folder run.');
} finally {
  await sql.end();
  await rm(directory, { recursive: true, force: true });
}
