import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, relative, isAbsolute } from 'node:path';
import { AppError } from '@/lib/errors';
import { createFolderDriver, type FolderFs } from './folder';
import type { Source, SourceDriver } from './types';
const execute = promisify(execFile);
export function createGitDriver(
  fs?: FolderFs,
  revision = async (path: string) =>
    (await execute('git', ['-C', path, 'rev-parse', 'HEAD'])).stdout.trim(),
): SourceDriver<Extract<Source, { type: 'git' }>> {
  const folder = createFolderDriver(fs);
  return {
    async *discover(source, ctx) {
      const checkout = resolve(ctx.repoRoot, source.path);
      const path = resolve(checkout, source.subdir);
      const subdir = relative(checkout, path);
      if (subdir.startsWith('..') || isAbsolute(subdir))
        throw new AppError('VALIDATION_FAILED', 'Git subdir must be inside the checkout.');
      ctx.onEvent({
        type: 'revision',
        key: `${source.id}:`,
        sourceId: source.id,
        revision: await revision(checkout),
      });
      yield* folder.discover({ ...source, type: 'folder', path, commitRaw: false }, ctx);
    },
    load: (ref, ctx) => folder.load(ref, ctx),
  };
}
