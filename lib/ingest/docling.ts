import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { z } from 'zod';
import { AppError } from '@/lib/errors';
import { sha256Hex } from '@/lib/hash';
import { forLauncher } from '@/lib/kit/runtime-config';

/**
 * D-152 / TRD §45: optional Docling parsing. Docling runs as a separate local container
 * (`./sourced docling on`); documents go to it over HTTP inside this machine and nowhere else.
 */
export const DOCLING_IMAGE = 'quay.io/docling-project/docling-serve-cpu:v1.38.2';
/** Download and disk sizes for the copy, measured for the pinned image (arm64 and amd64). */
export const DOCLING_DOWNLOAD = { downloadGb: 2.1, diskGb: 6.5 } as const;
/** Formats Docling reads in place of the built-in parsers; PPTX is read only by Docling. */
export const DOCLING_KINDS = ['pdf', 'docx', 'pptx'] as const;
export type DoclingKind = (typeof DOCLING_KINDS)[number];

const DEFAULT_URL = 'http://127.0.0.1:5001';
/** Compose sets DOCLING_URL to the service name; the Node path reaches the published port. */
export function doclingUrl(env: Record<string, string | undefined> = process.env): string {
  const value = env.DOCLING_URL?.trim();
  const parsed = z.url().safeParse(value);
  return (parsed.success ? parsed.data : DEFAULT_URL).replace(/\/+$/, '');
}

export type DoclingState = 'ready' | 'starting' | 'off';
/** `ready` once the models are loaded (`/ready` 200); `starting` while it loads them. */
export async function doclingStatus(
  options: { url?: string; fetch?: typeof fetch; timeoutMs?: number } = {},
): Promise<DoclingState> {
  const fetcher = options.fetch ?? fetch;
  try {
    const response = await fetcher(`${options.url ?? doclingUrl()}/ready`, {
      signal: AbortSignal.timeout(options.timeoutMs ?? 2000),
    });
    return response.ok ? 'ready' : 'starting';
  } catch {
    return 'off';
  }
}

const Task = z.object({ task_id: z.string().min(1), task_status: z.string() });
const Result = z.object({
  status: z.string(),
  document: z.object({ json_content: z.unknown() }).partial().optional(),
  errors: z.array(z.unknown()).default([]),
});

const MIME: Record<DoclingKind, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

export type DoclingConvert = (
  bytes: Uint8Array,
  input: { fileName: string; kind: DoclingKind; language: string; contentHash: string },
  options?: { cacheOnly?: boolean },
) => Promise<unknown>;

/** Stops the whole run instead of failing one file (see `loadCorpus`). */
export class DoclingUnavailableError extends AppError {}
export function unavailable(cause?: unknown): DoclingUnavailableError {
  return new DoclingUnavailableError(
    'PROVIDER_ERROR',
    forLauncher(
      'Docling is turned on for this library but is not running. Run pnpm sourced docling on to start it (or pnpm sourced docling off to use the built-in readers), then index again.',
    ),
    cause === undefined ? undefined : { cause },
  );
}

/** Request options; part of the cache key, so changing them converts every file again. */
function formFields(kind: DoclingKind, language: string): [string, string][] {
  return [
    ['from_formats', kind],
    ['to_formats', 'json'],
    ['image_export_mode', 'placeholder'],
    ['include_images', 'false'],
    ['do_ocr', 'true'],
    ['ocr_lang', language],
    ['do_pdf_heading_hierarchy', 'true'],
    ['abort_on_error', 'false'],
    ['document_timeout', '1800'],
  ];
}

/**
 * Converts one file with the async API (CPU conversion of a long PDF takes minutes, beyond the
 * sync endpoint's wait), and keeps the result in `.sourced/docling-cache/` keyed by the file's
 * hash, the image and the options, so unchanged files are not converted again.
 */
export function createDoclingConverter(
  options: {
    url?: string;
    fetch?: typeof fetch;
    cacheDir?: string;
    pollSeconds?: number;
    timeoutMs?: number;
    wait?: (ms: number) => Promise<unknown>;
  } = {},
): DoclingConvert {
  const fetcher = options.fetch ?? fetch;
  const base = options.url ?? doclingUrl();
  const cacheDir = options.cacheDir ?? path.join(process.cwd(), '.sourced', 'docling-cache');
  const wait = options.wait ?? ((ms: number) => sleep(ms));
  let checked = false;
  const call = async (url: string, init?: RequestInit) => {
    try {
      return await fetcher(url, init);
    } catch (cause) {
      throw unavailable(cause);
    }
  };
  /** `cacheOnly` (dry runs): the saved result, or `undefined` without calling Docling. */
  return async (bytes, input, { cacheOnly = false } = {}) => {
    const fields = formFields(input.kind, input.language);
    const key = sha256Hex(
      JSON.stringify({ image: DOCLING_IMAGE, hash: input.contentHash, fields }),
    ).slice(0, 40);
    const cached = path.join(cacheDir, `${key}.json`);
    try {
      return JSON.parse(await readFile(cached, 'utf8')) as unknown;
    } catch {
      // Not converted yet.
    }
    if (cacheOnly) return undefined;
    if (!checked) {
      const state = await doclingStatus({ url: base, fetch: fetcher });
      if (state !== 'ready')
        throw state === 'starting'
          ? new DoclingUnavailableError(
              'PROVIDER_ERROR',
              'Docling is still starting (it loads its models first). Wait a minute, then index again.',
            )
          : unavailable();
      checked = true;
    }
    const form = new FormData();
    for (const [name, value] of fields) form.append(name, value);
    form.append(
      'files',
      new Blob([new Uint8Array(bytes)], { type: MIME[input.kind] }),
      path.basename(input.fileName) || `document.${input.kind}`,
    );
    const submitted = await call(`${base}/v1/convert/file/async`, { method: 'POST', body: form });
    if (!submitted.ok)
      throw new AppError(
        'PROVIDER_ERROR',
        `Docling refused ${input.fileName} (HTTP ${String(submitted.status)}).`,
      );
    let task = Task.parse(await submitted.json());
    const deadline = Date.now() + (options.timeoutMs ?? 30 * 60_000);
    const poll = options.pollSeconds ?? 5;
    while (task.task_status !== 'success' && task.task_status !== 'failure') {
      if (Date.now() > deadline)
        throw new AppError('PROVIDER_TIMEOUT', `Docling took too long to read ${input.fileName}.`);
      const response = await call(
        `${base}/v1/status/poll/${encodeURIComponent(task.task_id)}?wait=${String(poll)}`,
      );
      if (!response.ok)
        throw new AppError(
          'PROVIDER_ERROR',
          `Docling lost track of ${input.fileName} (HTTP ${String(response.status)}).`,
        );
      task = Task.parse(await response.json());
      if (task.task_status !== 'success' && task.task_status !== 'failure') await wait(250);
    }
    const response = await call(`${base}/v1/result/${encodeURIComponent(task.task_id)}`);
    const result = Result.safeParse(response.ok ? await response.json() : null);
    const json = result.success ? result.data.document?.json_content : undefined;
    if (
      task.task_status === 'failure' ||
      !result.success ||
      !['success', 'partial_success'].includes(result.data.status) ||
      json === undefined ||
      json === null
    )
      throw new AppError('PROVIDER_ERROR', `Docling could not read ${input.fileName}.`);
    await mkdir(cacheDir, { recursive: true });
    const temporary = `${cached}.${crypto.randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(json));
    await rename(temporary, cached);
    return json;
  };
}
