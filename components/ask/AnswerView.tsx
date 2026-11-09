import { createContext, useContext } from 'react';
import { CodeBlock } from './CodeBlock';
import Markdown, { type Components } from 'react-markdown';
import { remarkCitations } from '@/lib/markdown/remark-citations';
import type { SseEvent } from '@/lib/sse/events';
import { CitationChip } from './CitationChip';

type Meta = Extract<SseEvent, { event: 'meta' }>['data'];
type Citations = Extract<SseEvent, { event: 'citations' }>['data'];
type CitationContextValue = {
  passages: Meta['passages'];
  citations: Citations | null;
  onSelect: (label: string) => void;
};
const CitationContext = createContext<CitationContextValue | null>(null);

// Stable component types preserve citation opener nodes (and code-copy state)
// when opening a viewer causes the conversation to render again.
const markdownComponents: Components = {
  pre: ({ node }) => {
    const code = node?.children.find(
      (child) => child.type === 'element' && child.tagName === 'code',
    );
    if (code?.type !== 'element') return null;
    const source = code.children
      .map((child) => (child.type === 'text' ? child.value : ''))
      .join('');
    const classes = code.properties.className;
    const language = Array.isArray(classes)
      ? (classes.find((name) => name.startsWith('language-')) ?? '').replace(/^language-/, '')
      : '';
    return <CodeBlock source={source} language={language} />;
  },
  code: ({ children }) => (
    <code className="rounded-[5px] border border-[var(--rule)] bg-[var(--rail)] px-1 font-mono text-[0.875em]">
      {children}
    </code>
  ),
  span: function CitationSpan({ node, children }) {
    const context = useContext(CitationContext);
    const label = node?.properties['dataCitation'];
    if (typeof label !== 'string' || !context) return <span>{children}</span>;
    const passage = context.citations?.valid.some((citation) => citation.label === label)
      ? context.passages.find((item) => item.label === label)
      : undefined;
    return <CitationChip label={label} passage={passage} onSelect={context.onSelect} />;
  },
};

export function AnswerView({
  text,
  passages,
  citations,
  onSelect,
}: CitationContextValue & { text: string }) {
  return (
    <CitationContext.Provider value={{ passages, citations, onSelect }}>
      <div className="space-y-4 leading-[1.7] break-words [&_pre]:overflow-x-auto [&_pre]:whitespace-pre">
        <Markdown
          skipHtml
          allowedElements={['p', 'ul', 'ol', 'li', 'code', 'pre', 'strong', 'em', 'br', 'span']}
          unwrapDisallowed
          remarkPlugins={[remarkCitations]}
          components={markdownComponents}
        >
          {citations?.answer ?? text}
        </Markdown>
      </div>
    </CitationContext.Provider>
  );
}
