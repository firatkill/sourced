import { normalize } from '@/lib/citations/normalize';
import { sha256Hex } from '@/lib/hash';
import type { Block, ParsedDocument, Section } from './parse-html';

function blockHash(block: Block): string {
  const text =
    block.kind === 'list'
      ? block.items.join('\n')
      : block.kind === 'table'
        ? block.rows.join('\n')
        : block.text;
  return sha256Hex(normalize(text));
}
function sections(section: Section): Section[] {
  return [section, ...section.children.flatMap(sections)];
}
/** FR-71: count distinct documents, not occurrences, independently for each source. */
export function removeBoilerplate(
  documents: { sourceId?: string; document: ParsedDocument }[],
): Record<string, number> {
  const removed: Record<string, number> = {};
  const sources = new Set(documents.flatMap((doc) => (doc.sourceId ? [doc.sourceId] : [])));
  for (const source of sources) {
    const group = documents.filter((doc) => doc.sourceId === source);
    removed[source] = 0;
    if (group.length < 10) continue;
    const frequency = new Map<string, number>();
    for (const doc of group) {
      const hashes = new Set(sections(doc.document.root).flatMap((s) => s.blocks.map(blockHash)));
      for (const hash of hashes) frequency.set(hash, (frequency.get(hash) ?? 0) + 1);
    }
    const threshold = Math.max(5, Math.ceil(group.length * 0.3));
    for (const doc of group)
      for (const section of sections(doc.document.root)) {
        section.blocks = section.blocks.filter((block) => {
          if ((frequency.get(blockHash(block)) ?? 0) < threshold) return true;
          removed[source] = (removed[source] ?? 0) + 1;
          return false;
        });
      }
  }
  return removed;
}
