// D-137: the Docker app container validates configuration, environment and the
// database before `next start`. A failure is written where the launcher reads it,
// so `./sourced dev` can say what failed and what to run next instead of exiting
// silently with a stack trace in the container log.
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { connectDatabase, initializeDatabase } from '@/lib/cli/commands/database';
import { errorEnvelope } from '@/lib/cli/router';
import { redact } from '@/lib/cli/output';
import { allowSetupMode, getCliSecrets, getEnv, setupState } from '@/lib/env';
import { issueSetupToken } from '@/lib/setup/token';
import { loadConfig } from '@/lib/kit/load-config';
import { forLauncher, getKitConfig, setCliKitConfig } from '@/lib/kit/runtime-config';

/** T-90: an empty index also sends the browser to setup, so the launcher prints the link. */
async function indexIsEmpty(): Promise<boolean> {
  if (getKitConfig().profile !== 'local') return false;
  const sql = connectDatabase();
  try {
    const [row] = await sql<
      { documents: number }[]
    >`SELECT count(*)::int AS documents FROM documents`;
    return (row?.documents ?? 0) === 0;
  } catch {
    return false;
  } finally {
    await sql.end();
  }
}

export async function startApp(root = process.cwd()): Promise<boolean> {
  const directory = path.join(root, '.sourced');
  const files = {
    json: path.join(directory, 'startup-error.json'),
    text: path.join(directory, 'startup-error.txt'),
    pending: path.join(directory, 'setup-pending'),
  };
  await rm(files.json, { force: true });
  await rm(files.text, { force: true });
  await rm(files.pending, { force: true });
  try {
    setCliKitConfig(await loadConfig(root));
    // T-88: no provider key yet is setup mode, not a failure; the launcher prints the link.
    allowSetupMode();
    getEnv();
    await initializeDatabase(getKitConfig());
    issueSetupToken(root, false);
    if (setupState().required || (await indexIsEmpty())) await writeFile(files.pending, '');
    return true;
  } catch (error) {
    const { envelope } = errorEnvelope('dev', error);
    const secrets = getCliSecrets();
    const clean = (text: string) => forLauncher(redact(text, secrets));
    const failure = {
      code: envelope.error?.code ?? 'INTERNAL_ERROR',
      message: clean(envelope.error?.message ?? 'The app did not start.'),
      fix: clean(envelope.error?.fix ?? 'docker compose logs app'),
    };
    await mkdir(directory, { recursive: true });
    await writeFile(
      files.json,
      `${JSON.stringify({ schemaVersion: 1, command: 'dev', ok: false, error: failure, warnings: [] })}\n`,
    );
    await writeFile(
      files.text,
      `The app did not start: ${failure.message}\nNext: ${failure.fix}\n`,
    );
    process.stderr.write(`${JSON.stringify({ event: 'startup.failed', ...failure })}\n`);
    return false;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  process.exitCode = (await startApp()) ? 0 : 1;
}
