import 'server-only';
// D-152 / TRD §45.4: the Docling choice as Setup and Settings see it. The browser can record
// the choice; only the terminal (`./sourced docling on`) can download and start the container.
import type { KitConfig } from '@/lib/kit/config-schema';
import { sourcedCommand } from '@/lib/kit/runtime-config';
import { DOCLING_DOWNLOAD, doclingStatus } from '@/lib/ingest/docling';
import { readConfig, writeConfig } from './config';

export type DoclingInfo = {
  engine: 'builtin' | 'docling';
  service: 'ready' | 'starting' | 'off';
  /** What to type in the terminal to download and start Docling. */
  command: string;
  downloadGb: number;
  diskGb: number;
};

export async function doclingInfo(config: KitConfig = readConfig()): Promise<DoclingInfo> {
  return {
    engine: config.parsing?.engine ?? 'builtin',
    service: await doclingStatus(),
    command: `${sourcedCommand()} docling on`,
    ...DOCLING_DOWNLOAD,
  };
}

/** Records the reader for the next indexing run; `builtin` removes the key again. */
export async function setDoclingEngine(engine: 'builtin' | 'docling'): Promise<DoclingInfo> {
  const rest = readConfig();
  delete rest.parsing;
  const next: KitConfig = engine === 'docling' ? { ...rest, parsing: { engine } } : rest;
  await writeConfig(next);
  return doclingInfo(next);
}
