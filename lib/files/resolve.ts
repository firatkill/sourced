import 'server-only';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import type { KitConfig } from '@/lib/kit/config-schema';

/** T-84: roots a file citation may be served from: configured folder and git sources only. */
export function sourceRoots(sources: KitConfig['sources'], cwd: string): string[] {
  return sources.flatMap((source) => {
    if (source.type === 'folder') return [path.resolve(cwd, source.path)];
    if (source.type === 'git') return [path.resolve(cwd, source.path, source.subdir)];
    return [];
  });
}

/**
 * The real path of `candidate` when it is a regular file inside one of `roots`, after
 * resolving symlinks on both sides; otherwise null. Never throws for missing paths.
 */
export async function containedFile(candidate: string, roots: string[]): Promise<string | null> {
  let real: string;
  try {
    real = await realpath(candidate);
    if (!(await stat(real)).isFile()) return null;
  } catch {
    return null;
  }
  for (const root of roots) {
    let realRoot: string;
    try {
      realRoot = await realpath(root);
    } catch {
      continue;
    }
    if (real.startsWith(realRoot.endsWith(path.sep) ? realRoot : `${realRoot}${path.sep}`))
      return real;
  }
  return null;
}

/** Content types that browsers may show inline; anything else downloads. HTML is shown as text. */
export function fileContentType(file: string): { type: string; inline: boolean } {
  switch (path.extname(file).toLowerCase()) {
    case '.pdf':
      return { type: 'application/pdf', inline: true };
    case '.md':
    case '.markdown':
    case '.txt':
    case '.html':
    case '.htm':
      return { type: 'text/plain; charset=utf-8', inline: true };
    case '.docx':
      return {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        inline: false,
      };
    default:
      return { type: 'application/octet-stream', inline: false };
  }
}
