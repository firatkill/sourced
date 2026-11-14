// TC-190: isolate the runtime snapshot without changing the public-demo build or config.
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { configHash, SnapshotSchema } from '../../lib/kit/load-config';

const root = process.cwd();
const directory = await mkdtemp(path.join(tmpdir(), 'sourced-local-e2e-'));
await mkdir(path.join(directory, '.sourced'));
const snapshot = SnapshotSchema.parse(JSON.parse(await readFile('.sourced/config.json', 'utf8')));
snapshot.config.profile = 'local';
snapshot.configHash = configHash(snapshot.config);
await writeFile(path.join(directory, '.sourced/config.json'), JSON.stringify(snapshot));
await writeFile(path.join(directory, '.sourced/copy.json'), await readFile('.sourced/copy.json'));
for (const name of ['corpus', 'eval', 'tests'])
  await symlink(path.join(root, name), path.join(directory, name), 'dir');
const child = spawn(
  process.execPath,
  [path.join(root, 'node_modules/next/dist/bin/next'), 'start', root, '-p', '3103'],
  {
    cwd: directory,
    stdio: 'inherit',
    env: process.env,
  },
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
