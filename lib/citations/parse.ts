import { z } from 'zod';

export type Marker = { label: string; start: number; end: number };

const CitationBlock = z.object({
  citations: z.array(z.object({ id: z.string(), quote: z.string() })),
});

/** Transform prose only: code spans and fenced blocks are kept byte-for-byte. */
function mapProse(answer: string, transform: (text: string, offset: number) => string): string {
  const fences = /^ {0,3}(`{3,}|~{3,})[^\n]*(?:\n|$)/gm;
  let result = '';
  let cursor = 0;
  const inline = (text: string, base: number) => {
    const runs = /`+/g;
    let output = '';
    let start = 0;
    for (let open = runs.exec(text); open; open = runs.exec(text)) {
      const afterOpen = runs.lastIndex;
      let close = runs.exec(text);
      while (close && close[0].length !== open[0].length) close = runs.exec(text);
      if (!close) {
        runs.lastIndex = afterOpen;
        continue;
      }
      output +=
        transform(text.slice(start, open.index), base + start) +
        text.slice(open.index, runs.lastIndex);
      start = runs.lastIndex;
    }
    return output + transform(text.slice(start), base + start);
  };
  for (let open = fences.exec(answer); open; open = fences.exec(answer)) {
    const delimiter = open[1];
    if (!delimiter) continue;
    const closing = new RegExp(
      `^ {0,3}${delimiter.charAt(0)}{${String(delimiter.length)},}[\\t ]*(?:\\r?\\n|$)`,
      'gm',
    );
    closing.lastIndex = fences.lastIndex;
    const close = closing.exec(answer);
    const end = close ? closing.lastIndex : answer.length;
    result += inline(answer.slice(cursor, open.index), cursor) + answer.slice(open.index, end);
    cursor = end;
    fences.lastIndex = end;
  }
  return result + inline(answer.slice(cursor), cursor);
}

/** Offsets refer to the returned, canonicalized answer. */
export function parseMarkers(answer: string): { answer: string; markers: Marker[] } {
  const canonical = mapProse(answer, (text) =>
    text
      .replace(/\[\s*(P\d{1,2}(?:\s*[,;]\s*P\d{1,2})+)\s*\]/gi, (_group, ids: string) =>
        ids
          .split(/\s*[,;]\s*/)
          .map((id) => `[${id.toUpperCase()}]`)
          .join(''),
      )
      .replace(/\[p(\d{1,2})\]/g, '[P$1]'),
  );
  // Valid labels are P1–P9. Also collect out-of-range labels so verification
  // can remove them with UNKNOWN_PASSAGE (TRD §14.3, FR-21).
  const markers: Marker[] = [];
  const prose = mapProse(canonical, (text, start) => {
    for (const match of text.matchAll(/\[P(\d{1,2})\]/g)) {
      markers.push({
        label: match[0].slice(1, -1),
        start: start + match.index,
        end: start + match.index + match[0].length,
      });
    }
    return text;
  });
  return { answer: prose, markers };
}

export function parseBlock(block: string | null | undefined): Map<string, string> | null {
  if (!block) return null;
  const json = block
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    const parsed = CitationBlock.safeParse(JSON.parse(json));
    if (!parsed.success) return null;
    const quotes = new Map<string, string>();
    for (const { id, quote } of parsed.data.citations) {
      const label = id.toUpperCase();
      if (!quotes.has(label)) quotes.set(label, quote);
    }
    return quotes;
  } catch {
    return null;
  }
}

export function removeMarkers(answer: string, invalidLabels: ReadonlySet<string>): string {
  const parsed = parseMarkers(answer);
  let cleaned = parsed.answer;
  for (const marker of parsed.markers.toReversed()) {
    if (invalidLabels.has(marker.label))
      cleaned = cleaned.slice(0, marker.start) + cleaned.slice(marker.end);
  }
  return mapProse(cleaned, (text) => text.replace(/ {2,}/g, ' ').replace(/ +([.,;:])/g, '$1'));
}
