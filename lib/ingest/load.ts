import { readFile } from 'node:fs/promises';
import { AppError } from '@/lib/errors';
import { sha256Hex } from '@/lib/hash';
import { loadManifest } from './manifest';
import { fetchRawPages } from './fetch';
import { parseHtml } from './parse-html';
import { chunkDocument } from './chunk';

export function assertIngestAllowed(vercel: string | undefined): void {
  if (vercel) throw new AppError('INTERNAL_ERROR', 'Ingestion is not allowed on Vercel.');
}

export async function loadCorpus(options: {
  offline: boolean;
  refresh: boolean;
  includeFixtures: boolean;
  fetchOnly?: boolean;
  onStatus?: (slug: string, status: 'fetched' | 'unchanged' | 'failed') => void;
}) {
  const manifest = await loadManifest();
  await fetchRawPages(manifest, options);
  if (options.fetchOnly) return [];
  const pages = [
    ...manifest.pages.map((page) => ({
      ...page,
      path: `corpus/raw/${page.slug}`,
      url: new URL(page.slug, manifest.baseUrl).href,
      isFixture: false,
    })),
    ...(options.includeFixtures
      ? manifest.fixtures.map((page) => ({ ...page, isFixture: true }))
      : []),
  ];
  const documents = [];
  for (const page of pages) {
    const bytes = await readFile(page.path);
    const document = parseHtml(bytes.toString('utf8'), {
      ...page,
      contentSelector: manifest.contentSelector,
      removeSelectors: manifest.removeSelectors,
    });
    documents.push({
      slug: page.slug,
      url: page.url,
      title: document.title,
      version: manifest.version,
      section: page.section,
      contentHash: sha256Hex(bytes),
      isFixture: page.isFixture,
      chunks: chunkDocument(document, page.slug),
      document,
    });
  }
  return documents;
}
