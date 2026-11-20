import { saveUploads, UPLOAD } from '@/lib/setup/documents';
import { setupRoute } from '@/lib/setup/http';

export const runtime = 'nodejs';

/** Multipart upload into `my-docs/`; each file's name carries its relative path. */
export function POST(request: Request): Promise<Response> {
  return setupRoute(
    request,
    async ({ form }) => {
      const files = (form?.getAll('files') ?? []).filter(
        (value): value is File => value instanceof File,
      );
      return Response.json(await saveUploads(files));
    },
    { body: 'form', maxBytes: UPLOAD.MAX_REQUEST_BYTES },
  );
}
