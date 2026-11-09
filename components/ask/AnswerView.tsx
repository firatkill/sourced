import Markdown from 'react-markdown';
import { remarkCitations } from '@/lib/markdown/remark-citations';
import type { SseEvent } from '@/lib/sse/events';
import { CitationChip } from './CitationChip';

type Meta = Extract<SseEvent, { event: 'meta' }>['data'];
type Citations = Extract<SseEvent, { event: 'citations' }>['data'];

export function AnswerView({
  text,
  passages,
  citations,
  onSelect,
}: {
  text: string;
  passages: Meta['passages'];
  citations: Citations | null;
  onSelect: (label: string) => void;
}) {
  return (
    <div className="space-y-4 break-words [&_pre]:overflow-x-auto [&_pre]:whitespace-pre">
      <Markdown
        skipHtml
        allowedElements={['p', 'ul', 'ol', 'li', 'code', 'pre', 'strong', 'em', 'br', 'span']}
        unwrapDisallowed
        remarkPlugins={[remarkCitations]}
        components={{
          span: ({ node, children }) => {
            const label = node?.properties['dataCitation'];
            if (typeof label !== 'string') return <span>{children}</span>;
            const passage = citations?.valid.some((citation) => citation.label === label)
              ? passages.find((item) => item.label === label)
              : undefined;
            return <CitationChip label={label} passage={passage} onSelect={onSelect} />;
          },
        }}
      >
        {citations?.answer ?? text}
      </Markdown>
    </div>
  );
}
