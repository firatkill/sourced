import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { AppError } from '@/lib/errors';

const PageSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+\.html$/),
  section: z.string().min(1),
});
export const ManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    name: z.string().min(1),
    version: z.string().min(1),
    baseUrl: z.url(),
    license: z.string().min(1),
    licenseUrl: z.url(),
    attribution: z.string().min(1),
    contentSelector: z.string().min(1),
    removeSelectors: z.array(z.string().min(1)),
    pages: z.array(PageSchema).min(30).max(40),
    fixtures: z.array(PageSchema.extend({ path: z.string().min(1), url: z.url() })),
  })
  .superRefine((manifest, ctx) => {
    const slugs = [...manifest.pages, ...manifest.fixtures].map((page) => page.slug);
    if (new Set(slugs).size !== slugs.length)
      ctx.addIssue({ code: 'custom', message: 'Manifest slugs must be unique', path: ['pages'] });
  });
export type Manifest = z.infer<typeof ManifestSchema>;
export type ManifestPage = z.infer<typeof PageSchema>;

export async function loadManifest(path = 'corpus/manifest.json'): Promise<Manifest> {
  try {
    const raw: unknown = JSON.parse(await readFile(path, 'utf8'));
    return ManifestSchema.parse(raw);
  } catch (cause) {
    throw new AppError('VALIDATION_FAILED', 'Invalid corpus manifest.', { cause });
  }
}
