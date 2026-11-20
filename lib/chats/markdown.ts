// T-92 / R2 Settings › Chats and data: a saved chat as a Markdown file. Each answer keeps
// its [P1] markers, and its verified quotes follow with where they come from.
import type { ChatSummary, SavedTurn } from './store';

function location(passage: SavedTurn['answer']['meta']['passages'][number]): string {
  const where = passage.officialUrl ?? passage.filePath;
  const page =
    passage.pageFrom === undefined
      ? ''
      : passage.pageTo && passage.pageTo !== passage.pageFrom
        ? `, pages ${String(passage.pageFrom)}–${String(passage.pageTo)}`
        : `, page ${String(passage.pageFrom)}`;
  return `${where}${page}`;
}

function quote(text: string): string {
  return text
    .trim()
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join('\n');
}

export function chatMarkdown(chat: ChatSummary & { turns: SavedTurn[] }): string {
  const parts = [`# ${chat.title}`, '', `Saved from Sourced on ${chat.createdAt.slice(0, 10)}.`];
  for (const turn of chat.turns) {
    parts.push('', `## ${turn.question}`, '');
    if (turn.standaloneQuestion) parts.push(`_Searched for: ${turn.standaloneQuestion}_`, '');
    const citations = turn.answer.citations;
    const answer = citations?.answer || turn.answer.answerText;
    parts.push(answer.trim() || '_No answer was saved for this question._');
    const passages = new Map(turn.answer.meta.passages.map((p) => [p.label, p]));
    const sources = (citations?.valid ?? []).flatMap((citation) => {
      const passage = passages.get(citation.label);
      return passage ? [{ citation, passage }] : [];
    });
    if (sources.length) {
      parts.push('', '### Sources', '');
      for (const { citation, passage } of sources)
        parts.push(
          `**[${citation.label}] ${passage.documentTitle}**, ${passage.headingPath.join(' › ')} (${location(passage)})`,
          '',
          quote(citation.quote),
          '',
        );
      parts.pop();
    }
  }
  return `${parts.join('\n')}\n`;
}

/** A file name that is safe on every platform. */
export function markdownFileName(title: string): string {
  const base = title
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60)
    .toLowerCase();
  return `${base || 'chat'}.md`;
}
