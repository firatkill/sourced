import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, resolve, relative, dirname, basename } from 'node:path';
import { createRequire } from 'node:module';
import { AppError } from '@/lib/errors';
import { sha256Hex } from '@/lib/hash';
import { MIME_BY_EXTENSION, normalizePath, type Source, type SourceDriver } from './types';

// picomatch does not ship TypeScript declarations; this is its used public surface.
const picomatch = createRequire(import.meta.url)('picomatch') as (
  patterns: string | string[],
) => (path: string) => boolean;
export function included(path: string, source: Pick<Source, 'include' | 'exclude'>): boolean {
  return (
    (!source.include.length || picomatch(source.include)(path)) &&
    (!source.exclude.length || !picomatch(source.exclude)(path))
  );
}
export type FolderFs = {
  entries: (path: string) => Promise<{ name: string; directory: boolean; file: boolean }[]>;
  size: (path: string) => Promise<number>;
  read: (path: string) => Promise<Uint8Array>;
};
export const folderFs: FolderFs = {
  entries: async (path) =>
    (await readdir(path, { withFileTypes: true })).map((entry) => ({
      name: entry.name,
      directory: entry.isDirectory(),
      file: entry.isFile(),
    })),
  size: async (path) => (await stat(path)).size,
  read: readFile,
};
export function createFolderDriver(
  fs: FolderFs = folderFs,
): SourceDriver<Extract<Source, { type: 'folder' }>> {
  return {
    async *discover(source, ctx) {
      const globAt = source.path.search(/[*?{[!]/);
      const slash = globAt < 0 ? -1 : source.path.lastIndexOf('/', globAt);
      let root = resolve(
        ctx.repoRoot,
        globAt < 0 ? source.path : slash < 0 ? '.' : source.path.slice(0, slash),
      );
      let pathGlob = globAt < 0 ? undefined : source.path.slice(slash + 1);
      let rootEntries: Awaited<ReturnType<FolderFs['entries']>>;
      try {
        rootEntries = await fs.entries(root);
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOTDIR')) throw error;
        pathGlob = basename(root);
        root = dirname(root);
        rootEntries = await fs.entries(root);
      }
      async function* walk(dir: string): AsyncIterable<import('./types').DocumentRef> {
        for (const entry of (dir === root ? rootEntries : await fs.entries(dir)).sort((a, b) =>
          a.name.localeCompare(b.name),
        )) {
          const absolute = resolve(dir, entry.name);
          const path = normalizePath(relative(root, absolute));
          const key = `${source.id}:${path}`;
          if (
            entry.name.startsWith('.') ||
            entry.name === 'node_modules' ||
            (!entry.file && !entry.directory)
          ) {
            ctx.onEvent({ type: 'skipped', key, reason: 'excluded entry' });
            continue;
          }
          if (entry.directory) {
            yield* walk(absolute);
            continue;
          }
          if ((pathGlob && !picomatch(pathGlob)(path)) || !included(path, source)) continue;
          if (!MIME_BY_EXTENSION[extname(path).toLowerCase()]) {
            ctx.onEvent({ type: 'skipped', key, reason: 'unsupported extension' });
            continue;
          }
          if ((await fs.size(absolute)) > 50 * 1024 * 1024) {
            ctx.onEvent({ type: 'skipped', key, reason: 'over 50 MB' });
            continue;
          }
          ctx.onEvent({ type: 'discovered', key });
          yield {
            key,
            sourceId: source.id,
            group: source.group,
            location: { kind: 'file', path: absolute },
          };
        }
      }
      yield* walk(root);
    },
    async load(ref, ctx) {
      if (ref.location.kind !== 'file')
        throw new AppError('VALIDATION_FAILED', 'Expected a file source.');
      const mimeType = MIME_BY_EXTENSION[extname(ref.location.path).toLowerCase()];
      if (!mimeType) throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'Unsupported source extension.');
      try {
        const bytes = await fs.read(ref.location.path);
        ctx.onEvent({ type: 'cached', key: ref.key });
        return {
          ...ref,
          bytes,
          mimeType,
          fetchedAt: new Date(ctx.now()),
          contentHash: sha256Hex(bytes),
        };
      } catch (cause) {
        ctx.onEvent({ type: 'failed', key: ref.key, code: 'INTERNAL_ERROR' });
        throw new AppError('INTERNAL_ERROR', 'Cannot read source file.', { cause });
      }
    },
  };
}
