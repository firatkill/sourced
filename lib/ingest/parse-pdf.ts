import { extractTextItems, getDocumentProxy, getMeta, type StructuredTextItem } from 'unpdf';
import type { ParsedDocument, Section } from './parse-html';

export type PdfLine = { text: string; fontSize: number; heading: boolean; page: number };
export type PdfText = { status: 'needs_ocr' } | { status: 'ok'; pages: PdfLine[][] };

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/** Reassemble text runs on a baseline before applying the line-length rule. */
function pageLines(items: StructuredTextItem[], page: number): PdfLine[] {
  const lines: { text: string; sizes: number[]; y: number }[] = [];
  let line: (typeof lines)[number] | undefined;
  for (const item of items) {
    if (item.str.trim()) {
      if (!line || Math.abs(line.y - item.y) > 0.5) {
        line = { text: '', sizes: [], y: item.y };
        lines.push(line);
      }
      line.text += item.str;
      line.sizes.push(item.fontSize);
    } else if (line && item.str) line.text += ' ';
    if (item.hasEOL) line = undefined;
  }
  const sizes = lines.map((value) => median(value.sizes));
  const pageMedian = median(sizes);
  return lines.map((value, index) => {
    const text = value.text.replace(/\s+/g, ' ').trim();
    const fontSize = sizes[index] ?? 0;
    return { text, fontSize, page, heading: fontSize >= 1.25 * pageMedian && text.length < 120 };
  });
}

/** FR-70 / TRD §33.4. unpdf owns and destroys its document/worker after extraction. */
export async function extractPdf(
  bytes: Uint8Array | Awaited<ReturnType<typeof getDocumentProxy>>,
): Promise<PdfText> {
  const { items, totalPages } = await extractTextItems(
    bytes instanceof Uint8Array ? new Uint8Array(bytes) : bytes,
  );
  const pages = items.map((page, index) => pageLines(page, index + 1));
  const characters = pages.flat().reduce((sum, line) => sum + line.text.length, 0);
  if (characters < 20 * totalPages) return { status: 'needs_ocr' };
  return { status: 'ok', pages };
}

export type PdfResult = { status: 'needs_ocr' } | { status: 'ok'; document: ParsedDocument };
const roundedSize = (size: number) => Math.round(size * 2) / 2;

/** FR-67, FR-70 / D-107: one section tree shared with the other loaders. */
export async function parsePdf(bytes: Uint8Array, fileName: string): Promise<PdfResult> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  try {
    const extracted = await extractPdf(pdf);
    if (extracted.status === 'needs_ocr') return extracted;
    const { info } = await getMeta(pdf);
    const infoTitle = typeof info.Title === 'string' ? info.Title.trim() : '';
    const title = infoTitle || extracted.pages[0]?.find((line) => line.heading)?.text || fileName;
    const root: Section = { id: '', level: 0, heading: title, blocks: [], children: [] };
    const sizes = [
      ...new Set(
        extracted.pages
          .flat()
          .filter((line) => line.heading)
          .map((line) => roundedSize(line.fontSize)),
      ),
    ].sort((a, b) => b - a);
    const starts = new Map<Section, number>();
    const stack = [root];
    let current = root;
    for (const [index, lines] of extracted.pages.entries()) {
      if (!sizes.length) {
        current = { id: '', level: 1, heading: title, blocks: [], children: [] };
        starts.set(current, index + 1);
        root.children.push(current);
      }
      for (const line of lines) {
        if (line.heading) {
          const level = Math.min(6, sizes.indexOf(roundedSize(line.fontSize)) + 1);
          while (stack.length > 1 && current.level >= level) {
            stack.pop();
            current = stack.at(-1) ?? root;
          }
          const section: Section = { id: '', level, heading: line.text, blocks: [], children: [] };
          starts.set(section, line.page);
          current.children.push(section);
          stack.push(section);
          current = section;
        } else current.blocks.push({ kind: 'paragraph', text: line.text, pages: [line.page] });
      }
    }
    const anchor = (section: Section): number[] => {
      const start = starts.get(section);
      const pages = [
        ...(start !== undefined ? [start] : []),
        ...section.blocks.flatMap((block) => block.pages ?? []),
        ...section.children.flatMap(anchor),
      ];
      if (pages.length) {
        const from = Math.min(...pages);
        const to = Math.max(...pages);
        section.id = from === to ? `p${String(from)}` : `p${String(from)}-${String(to)}`;
      }
      return pages;
    };
    anchor(root);
    return { status: 'ok', document: { title, root } };
  } finally {
    await pdf.loadingTask.destroy();
  }
}
