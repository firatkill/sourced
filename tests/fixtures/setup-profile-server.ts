// T-90: a fresh local checkout on port 3107 for the browser setup flow. It gets its own
// database (`<e2e database>_setup`), because choosing "my own documents" runs `reset`,
// which would empty the database the other E2E servers share. No provider key is passed
// on, and the setup token is fixed so the spec can open the link the launcher prints.
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { configHash, SnapshotSchema } from '../../lib/kit/load-config';
import { getCopy } from '../../lib/kit/copy';
import { requireLocalDatabase } from '../helpers/local-database';
import { SETUP_FIXTURE_TOKEN } from './setup-profile-server-token';

const port = '3107';
const root = process.cwd();

const shared = new URL(requireLocalDatabase(process.env.DATABASE_URL));
const name = `${shared.pathname.slice(1)}_setup`;
const admin = postgres({
  ...connection(shared),
  database: 'postgres',
  max: 1,
  onnotice: () => undefined,
});
try {
  const [exists] = await admin`SELECT 1 FROM pg_database WHERE datname = ${name}`;
  if (!exists) await admin.unsafe(`CREATE DATABASE "${name}"`);
} finally {
  await admin.end();
}
const url = new URL(shared);
url.pathname = `/${name}`;
const sql = postgres(url.href, { max: 1, prepare: false, onnotice: () => undefined });
try {
  await migrate(drizzle(sql), { migrationsFolder: path.join(root, 'drizzle') });
  const tables = await sql<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
  for (const table of tables)
    await sql`TRUNCATE TABLE ${sql(table.tablename)} RESTART IDENTITY CASCADE`;
} finally {
  await sql.end();
}

function connection(value: URL) {
  return {
    host: value.hostname,
    port: Number(value.port || 5432),
    username: decodeURIComponent(value.username),
    password: decodeURIComponent(value.password),
  };
}

const directory = await mkdtemp(path.join(tmpdir(), 'sourced-setup-e2e-'));
await mkdir(path.join(directory, '.sourced'));
const snapshot = SnapshotSchema.parse(JSON.parse(await readFile('.sourced/config.json', 'utf8')));
snapshot.config.profile = 'local';
snapshot.configHash = configHash(snapshot.config);
await writeFile(path.join(directory, '.sourced/config.json'), JSON.stringify(snapshot));
await writeFile(
  path.join(directory, '.sourced/copy.json'),
  JSON.stringify(getCopy(snapshot.config)),
);
await writeFile(path.join(directory, '.sourced/setup-token'), `${SETUP_FIXTURE_TOKEN}\n`, {
  mode: 0o600,
});
for (const folder of ['corpus', 'eval', 'tests'])
  await symlink(path.join(root, folder), path.join(directory, folder), 'dir');

const env: NodeJS.ProcessEnv = {
  ...process.env,
  DATABASE_URL: url.href,
  MIGRATION_DATABASE_URL: url.href,
  SOURCED_SETUP_MODE: '1',
};
for (const key of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'])
  Reflect.deleteProperty(env, key);
const child = spawn(
  process.execPath,
  [path.join(root, 'node_modules/next/dist/bin/next'), 'start', root, '-p', port],
  { cwd: directory, stdio: 'inherit', env },
);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    child.kill(signal);
  });
child.on('exit', (code) => {
  void rm(directory, { recursive: true, force: true }).then(() => {
    process.exitCode = code ?? 0;
  });
});
