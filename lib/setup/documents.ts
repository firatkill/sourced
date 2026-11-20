import 'server-only';
// T-89 / R2 §6 (documents): uploads land in `my-docs/<relative path>`, which becomes a
// folder source on first use; URLs go through the CLI's own source detection. Large
// folders stay on the CLI (`./sourced add <path>`): a browser cannot hand over a host path.
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { detectSource } from '@/lib/cli/commands/add';
import { runReset } from '@/lib/cli/commands/reset';
import { AppError } from '@/lib/errors';
import { reloadKitConfig } from '@/lib/kit/runtime-config';
import { MIME_BY_EXTENSION } from '@/lib/sources/types';
import { isExample, readConfig, writeConfig } from './config';

export const UPLOAD_FOLDER = 'my-docs';
export const UPLOAD = {
  /** Same limit as the folder source (lib/sources/folder.ts). */
  MAX_FILE_BYTES: 50 * 1024 * 1024,
  MAX_REQUEST_BYTES: 200 * 1024 * 1024,
  MAX_FILES: 500,
} as const;

/** A relative path under the upload folder, or null when it is unsafe or hidden. */
export function uploadPath(name: string): string | null {
  if (!name || name.length > 300 || name.includes('\0')) return null;
  const parts = name.replaceAll('\\', '/').split('/').filter(Boolean);
  if (!parts.length || parts.length > 12) return null;
  if (parts.some((part) => part === '.' || part === '..' || part.startsWith('.'))) return null;
  return parts.join('/');
}

export type UploadResult = {
  saved: string[];
  skipped: { name: string; reason: 'unsupported' | 'too_large' | 'invalid_name' }[];
  sourceAdded: boolean;
};

export async function saveUploads(files: File[], root = process.cwd()): Promise<UploadResult> {
  if (!files.length) throw new AppError('VALIDATION_FAILED', 'Choose at least one file.');
  if (files.length > UPLOAD.MAX_FILES)
    throw new AppError(
      'VALIDATION_FAILED',
      `Upload up to ${String(UPLOAD.MAX_FILES)} files at a time. For a large folder, run ./sourced add <folder>.`,
    );
  const base = path.resolve(root, UPLOAD_FOLDER);
  const result: UploadResult = { saved: [], skipped: [], sourceAdded: false };
  for (const file of files) {
    const relative = uploadPath(file.name);
    if (!relative) {
      result.skipped.push({ name: file.name.slice(0, 120), reason: 'invalid_name' });
      continue;
    }
    if (!MIME_BY_EXTENSION[path.extname(relative).toLowerCase()]) {
      result.skipped.push({ name: relative, reason: 'unsupported' });
      continue;
    }
    if (file.size > UPLOAD.MAX_FILE_BYTES) {
      result.skipped.push({ name: relative, reason: 'too_large' });
      continue;
    }
    const target = path.resolve(base, relative);
    if (!target.startsWith(`${base}${path.sep}`)) {
      result.skipped.push({ name: relative, reason: 'invalid_name' });
      continue;
    }
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${crypto.randomUUID()}.upload`;
    await writeFile(temporary, new Uint8Array(await file.arrayBuffer()));
    await rename(temporary, target);
    result.saved.push(relative);
  }
  if (result.saved.length) result.sourceAdded = await ensureUploadSource(root);
  return result;
}

async function ensureUploadSource(root: string): Promise<boolean> {
  const config = readConfig(root);
  if (config.sources.some((source) => source.type === 'folder' && source.path === UPLOAD_FOLDER))
    return false;
  const { source } = await detectSource(UPLOAD_FOLDER, { id: uniqueId(config, UPLOAD_FOLDER) });
  config.sources.push(source);
  await writeConfig(config, root);
  return true;
}

function uniqueId(config: ReturnType<typeof readConfig>, wanted: string): string {
  const taken = new Set(config.sources.map((source) => source.id));
  if (!taken.has(wanted)) return wanted;
  for (let n = 2; ; n += 1)
    if (!taken.has(`${wanted}-${String(n)}`)) return `${wanted}-${String(n)}`;
}

export async function addUrl(url: string, root = process.cwd()) {
  const config = readConfig(root);
  const detected = await detectSource(url, {});
  const source = { ...detected.source, id: uniqueId(config, detected.source.id) };
  config.sources.push(source);
  await writeConfig(config, root);
  return { source, detected: detected.detected };
}

/** Step 1 of setup: keep the bundled example, or start from your own documents (`reset`). */
export async function chooseData(choice: 'example' | 'own', root = process.cwd()) {
  const config = readConfig(root);
  if (choice === 'example') {
    if (!isExample(config))
      throw new AppError(
        'VALIDATION_FAILED',
        'The example was removed from this checkout. Run git checkout sourced.config.ts to bring it back.',
      );
    return { example: true, removedDocuments: 0 };
  }
  if (!isExample(config)) return { example: false, removedDocuments: 0 };
  const { removedDocuments } = await runReset({ config });
  reloadKitConfig();
  return { example: false, removedDocuments };
}

/** T-92: drops a source and its indexed documents, as `sources remove` does. */
export async function removeSource(id: string, root = process.cwd()) {
  const config = readConfig(root);
  if (!config.sources.some((source) => source.id === id))
    throw new AppError('NOT_FOUND', 'That source is no longer in your library.');
  const { getSql } = await import('@/lib/db/client');
  const removedDocuments = await getSql().begin(async (tx) => {
    const removed = await tx`DELETE FROM documents WHERE source_id = ${id} RETURNING id`;
    await tx`UPDATE corpus_meta SET documents_total = (SELECT count(*) FROM documents), updated_at = now() WHERE id = 1`;
    return removed.length;
  });
  await writeConfig(
    { ...config, sources: config.sources.filter((source) => source.id !== id) },
    root,
  );
  return { removedDocuments };
}
