import { readFile } from 'node:fs/promises';
import { parseHtml } from '@/lib/ingest/parse-html';
import { previewCorpus } from '@/lib/ingest/preview';
import { parseArgs } from 'node:util';
import { getEnv } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { loadManifest } from '@/lib/ingest/manifest';
import { fetchRawPages } from '@/lib/ingest/fetch';
import { RobotsDisallowedError } from '@/lib/ingest/robots';

try {
  const env = getEnv();
  if (env.VERCEL) throw new AppError('INTERNAL_ERROR', 'Ingestion is not allowed on Vercel.');
  const { values } = parseArgs({
    options: {
      'dry-run': { type: 'boolean' },
      'fetch-only': { type: 'boolean' },
      refresh: { type: 'boolean' },
      offline: { type: 'boolean' },
    },
    strict: true,
  });
  const manifest = await loadManifest();
  await fetchRawPages(manifest, {
    offline: values.offline ?? false,
    refresh: values.refresh ?? false,
    onStatus: (slug, status) => {
      console.log(`${status} ${slug}`);
    },
  });
  if (values['dry-run'] && !values['fetch-only']) {
    const documents = [];
    for (const page of manifest.pages) {
      const html = await readFile(`corpus/raw/${page.slug}`, 'utf8');
      documents.push({
        slug: page.slug,
        document: parseHtml(html, {
          ...page,
          contentSelector: manifest.contentSelector,
          removeSelectors: manifest.removeSelectors,
        }),
      });
    }
    console.log(JSON.stringify(previewCorpus(documents, env.PRICE_EMBED_PER_MTOK), null, 2));
  } else if (!values['fetch-only'])
    throw new AppError('INTERNAL_ERROR', 'Ingestion pipeline is added in T-14; use --fetch-only.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Ingest failed.');
  process.exitCode = error instanceof RobotsDisallowedError ? 2 : 1;
}
