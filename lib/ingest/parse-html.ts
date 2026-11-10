import { AppError } from '@/lib/errors';
import type { ManifestPage } from './manifest';
import { parsePostgresDocbook } from './presets/postgres-docbook';

export type Block =
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: string[]; ordered: boolean }
  | { kind: 'code'; text: string }
  | { kind: 'table'; rows: string[] }
  | { kind: 'note'; label: string; text: string };
export type Section = {
  id: string;
  level: number;
  heading: string;
  blocks: Block[];
  children: Section[];
};
export type ParsedDocument = { title: string; root: Section };
export type ParsePage = ManifestPage & {
  html: {
    preset: 'generic' | 'postgres-docbook';
    contentSelector: string;
    removeSelectors: string[];
  };
};

export function parseHtml(html: string, page: ParsePage): ParsedDocument {
  switch (page.html.preset) {
    case 'postgres-docbook':
      return parsePostgresDocbook(html, page);
    case 'generic':
      throw new AppError('VALIDATION_FAILED', 'Generic HTML parsing is not available yet.');
    default: {
      const unreachable: never = page.html.preset;
      throw new AppError('VALIDATION_FAILED', `Unsupported HTML preset: ${String(unreachable)}`);
    }
  }
}
