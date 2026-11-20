/** REDESIGN-v2 §3.3: library facts shown instead of the corpus title. Pure, no I/O. */
export type LibraryFacts = {
  documents: number;
  /** One label per source: `id/` for a folder source, the host name for web sources. */
  sources: string[];
  /** ISO time of the last successful ingest, or null when nothing has been indexed. */
  lastIngestAt: string | null;
};

export function documentCount(count: number): string {
  return count === 1 ? '1 document' : `${String(count)} documents`;
}

/** "just now", "5 min ago", "2 h ago", "3 days ago"; future times read as "just now". */
export function updatedAgo(iso: string, now: Date): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${String(minutes)} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${String(hours)} h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day ago' : `${String(days)} days ago`;
}

/** Header pill: "128 documents · updated 2 h ago", or "No documents indexed yet". */
export function libraryPill(facts: LibraryFacts, now: Date): string {
  if (facts.documents === 0 || facts.lastIngestAt === null) return 'No documents indexed yet';
  return `${documentCount(facts.documents)} · updated ${updatedAgo(facts.lastIngestAt, now)}`;
}

/** Line under the composer: "Searching handbook/, contracts/ and specs/"; null without sources. */
export function searchingLine(facts: LibraryFacts): string | null {
  const shown = facts.sources.slice(0, 3);
  const more = facts.sources.length - shown.length;
  if (shown.length === 0) return null;
  const items = more > 0 ? [...shown, `${String(more)} more`] : shown;
  const list =
    items.length === 1 ? items[0] : `${items.slice(0, -1).join(', ')} and ${String(items.at(-1))}`;
  return `Searching ${String(list)}`;
}
