import { INSPECT } from '@/lib/config';
import { detectLanguage } from './language';
import type { InspectFinding } from './schema';

export type Item = { key: string; status: string; reason: string | null };
export type Duplicate = { chunkId: string; otherChunkId: string; similarity: number };
export type FindingInput = {
  totalChunks: number;
  tinyChunks: number;
  oversizedChunks: number;
  sample: string[];
  duplicates: Duplicate[];
  language: string;
  items: Item[];
  boilerplate: { id: string; count: number | null }[];
};
export function buildFindings(input: FindingInput): InspectFinding[] {
  const findings: InspectFinding[] = [];
  const itemFinding = (
    code: 'empty_document' | 'needs_ocr' | 'skipped_files' | 'failed_items',
    items: Item[],
    severity: InspectFinding['severity'],
    affects: InspectFinding['affects'],
    fix: string,
  ) => {
    if (items.length)
      findings.push({
        code,
        severity,
        affects,
        fix,
        count: items.length,
        details: { items: items.map(({ key, reason }) => ({ key, reason })) },
      });
  };
  const skipped = input.items.filter((item) => item.status === 'skipped');
  itemFinding(
    'empty_document',
    skipped.filter((item) => item.reason === 'empty'),
    'warn',
    ['retrieval', 'citations'],
    'Add extractable text or correct the source content selector, then run sourced ingest.',
  );
  itemFinding(
    'needs_ocr',
    skipped.filter((item) => item.reason === 'needs_ocr'),
    'warn',
    ['retrieval', 'citations'],
    'Run OCR on these PDFs, replace them with searchable PDFs, then run sourced ingest.',
  );
  if (input.tinyChunks > input.totalChunks * INSPECT.TINY_RATIO)
    findings.push({
      code: 'tiny_chunks',
      severity: 'warn',
      affects: ['retrieval', 'cost'],
      fix: 'Merge short sections or adjust overrides.chunking.minTokens in sourced.config.ts, then run sourced ingest.',
      count: input.tinyChunks,
      details: { totalChunks: input.totalChunks },
    });
  if (input.oversizedChunks)
    findings.push({
      code: 'oversized_chunks',
      severity: 'info',
      affects: ['retrieval', 'cost'],
      fix: 'Split long code blocks in the source documents, then run sourced ingest.',
      count: input.oversizedChunks,
      details: { totalChunks: input.totalChunks },
    });
  const duplicates = input.duplicates.filter(
    (pair) => pair.similarity >= INSPECT.DUPLICATE_SIMILARITY,
  );
  const affected = new Set(duplicates.map((pair) => pair.chunkId)).size;
  if (affected > input.sample.length * INSPECT.DUPLICATE_RATIO)
    findings.push({
      code: 'near_duplicates',
      severity: 'warn',
      affects: ['retrieval', 'cost'],
      fix: 'Exclude duplicate documents or consolidate repeated content, then run sourced ingest.',
      count: affected,
      details: {
        pairs: duplicates,
        sampledChunks: input.sample.length,
        totalChunks: input.totalChunks,
        method:
          'Up to 200 chunks selected by hashed id; nearest cross-document neighbour in the selected sources using cosine distance (HNSW when chosen by the database planner). Count and ratio describe sampled chunks, not an exact corpus-wide total.',
      },
    });
  for (const source of input.boilerplate)
    findings.push({
      code: 'boilerplate_removed',
      severity: 'info',
      affects: ['retrieval', 'cost'],
      sourceId: source.id,
      fix:
        source.count === null
          ? 'Run sourced ingest to save a run report with boilerplate counts.'
          : 'Review repeated blocks in this source; keep substantive text unique across documents, then run sourced ingest if needed.',
      ...(source.count === null
        ? {
            details: {
              note: 'No saved report for this source in the last ingest run; count is unknown.',
            },
          }
        : { count: source.count }),
    });
  const language = detectLanguage(input.sample);
  if (language && language !== input.language)
    findings.push({
      code: 'language_mismatch',
      severity: 'warn',
      affects: ['retrieval'],
      fix: 'Set corpus.language to the document language in sourced.config.ts, then run sourced ingest --rebuild.',
      details: {
        configuredLanguage: input.language,
        detectedLanguage: language,
        sampledChunks: input.sample.length,
        method:
          'Highest stopword/token ratio over up to 200 sampled chunks; ties and text without stopword evidence abstain.',
      },
    });
  itemFinding(
    'skipped_files',
    skipped.filter(
      (item) => item.reason === 'unsupported extension' || item.reason === 'over 50 MB',
    ),
    'info',
    ['retrieval', 'citations'],
    'Convert unsupported files to a supported format and split files over 50 MB, then run sourced ingest.',
  );
  itemFinding(
    'failed_items',
    input.items.filter((item) => item.status === 'failed'),
    'error',
    ['retrieval', 'citations'],
    'Fix the listed item failures, then rerun sourced ingest to resume the last run.',
  );
  return findings;
}
