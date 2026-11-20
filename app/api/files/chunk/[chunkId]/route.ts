import { createReadStream } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { getSql } from '@/lib/db/client';
import { containedFile, fileContentType, sourceRoots } from '@/lib/files/resolve';
import { jsonError } from '@/lib/http/errors';
import { isPublicDemo } from '@/lib/kit/profile';
import { getKitConfig } from '@/lib/kit/runtime-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ chunkId: string }> };

/**
 * T-84 / REDESIGN-v2 §5: streams the original file a cited passage came from, so the source
 * viewer can open it ("Open at page n" via #page=n). Only files inside configured folder or
 * git sources are served; never under public-demo.
 */
async function resolve(request: Request, { params }: Context) {
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
  if (isPublicDemo()) return { requestId, file: null };
  const id = z
    .string()
    .regex(/^\d{1,19}$/)
    .safeParse((await params).chunkId);
  if (!id.success) return { requestId, file: null };
  const rows = await getSql()<{ url: string; source_kind: string | null }[]>`
    SELECT d.url, d.source_kind FROM chunks c JOIN documents d ON d.id = c.document_id
    WHERE c.id = ${id.data}::bigint`;
  const row = rows[0];
  if (row?.source_kind !== 'file') return { requestId, file: null };
  const file = await containedFile(row.url, sourceRoots(getKitConfig().sources, process.cwd()));
  return { requestId, file };
}

/** Lets the source viewer check that the file is still in the library. */
export async function HEAD(request: Request, context: Context): Promise<Response> {
  const { file } = await resolve(request, context);
  return new Response(null, {
    status: file === null ? 404 : 200,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export async function GET(request: Request, context: Context): Promise<Response> {
  const { requestId, file } = await resolve(request, context);
  if (file === null) return jsonError({ code: 'NOT_FOUND', status: 404, requestId });
  const { type, inline } = fileContentType(file);
  const name = path.basename(file).replace(/["\\\r\n]/g, '_');
  const body = Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>;
  return new Response(body, {
    headers: {
      'Content-Type': type,
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${name}"; filename*=UTF-8''${encodeURIComponent(path.basename(file))}`,
      'Cache-Control': 'private, no-store',
      // HTML and Markdown are sent as plain text, so a served file never runs scripts.
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
