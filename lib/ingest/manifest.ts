import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { join } from 'node:path';
import { getKitConfig } from '@/lib/kit/runtime-config';
import { SourceSchema } from '@/lib/kit/config-schema';
import { AppError } from '@/lib/errors';
import { rawFilename } from '@/lib/sources/urls';

const PageSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+\.html$/),
  section: z.string().min(1),
  path: z.string().optional(),
  url: z.url().optional(),
  html: SourceSchema.options[1].shape.html.unwrap().optional(),
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

// Compatibility view for the v1 scripts until the generic source pipeline lands.
// Source URLs, grouping and parser options come exclusively from configuration.
export async function loadManifest(path?: string): Promise<Manifest> {
  try {
    if (path === undefined) {
      const config = getKitConfig();
      const sources = config.sources;
      const first = sources[0];
      if (!first || first.type !== 'urls' || !first.urls[0])
        throw new AppError('VALIDATION_FAILED', 'The legacy ingest command requires URL sources.');
      const metadataSchema = z.object({
        version: z.string().min(1),
        fixtures: z.array(PageSchema.extend({ path: z.string().min(1), url: z.url() })),
      });
      const metadata: unknown = JSON.parse(
        await readFile(join('corpus', config.corpus.name, 'metadata.json'), 'utf8'),
      );
      const baseUrl = new URL('.', first.urls[0]).href;
      return ManifestSchema.parse({
        schemaVersion: 1,
        name: config.corpus.title,
        ...metadataSchema.parse(metadata),
        baseUrl,
        license: config.copy.license?.name,
        licenseUrl: config.copy.license?.url,
        attribution: config.corpus.attribution,
        contentSelector: first.html.contentSelector,
        removeSelectors: first.html.removeSelectors,
        pages: sources.flatMap((source) => {
          if (source.type !== 'urls')
            throw new AppError(
              'VALIDATION_FAILED',
              'The legacy ingest command requires URL sources.',
            );
          return source.urls.map((url) => {
            const slug = new URL(url).pathname.split('/').at(-1);
            return {
              slug,
              section: source.group,
              url,
              path: join('corpus', config.corpus.name, 'raw', source.id, rawFilename(url)),
              html: source.html,
            };
          });
        }),
      });
    }
    const raw: unknown = JSON.parse(await readFile(path, 'utf8'));
    return ManifestSchema.parse(raw);
  } catch (cause) {
    throw new AppError('VALIDATION_FAILED', 'Invalid corpus manifest.', { cause });
  }
}
