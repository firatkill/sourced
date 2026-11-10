import Markdown from 'react-markdown';
import type { Nodes, PhrasingContent, Root } from 'mdast';
import type { SseEvent } from './sse/events';

type Citations = Extract<SseEvent, { event: 'citations' }>['data'];
type Passage = Extract<SseEvent, { event: 'meta' }>['data']['passages'][number];

// Reuse the Markdown parser so emphasis, links, and code copy as plain text.
function plainText(answer: string): string {
  let result = '';
  function text(node: Nodes | PhrasingContent): string {
    if (node.type === 'html' || node.type === 'definition') return '';
    if (node.type === 'break') return '\n';
    if ('value' in node) return node.value;
    if ('children' in node)
      return node.children
        .map(text)
        .join(node.type === 'root' ? '\n\n' : node.type === 'list' ? '\n' : '');
    return '';
  }
  Markdown({
    children: answer,
    skipHtml: true,
    remarkPlugins: [
      () => (tree: Root) => {
        result = text(tree);
      },
    ],
  });
  return result;
}

export function formatCopy(citations: Citations, passages: Passage[]): string {
  const cited = new Set(citations.valid.map((citation) => citation.label));
  const sources = passages
    .filter((passage) => cited.has(passage.label))
    .sort((a, b) => a.label.localeCompare(b.label));
  const answer = plainText(citations.answer).replace(/\[P([1-9])\]/g, '[$1]');
  return `${answer}\n\nSources:\n${sources
    .map(
      (passage) =>
        `[${passage.label.slice(1)}] ${passage.documentTitle} › ${passage.headingPath.join(' › ')} — ${passage.officialUrl ?? passage.filePath}`,
    )
    .join('\n')}`;
}
