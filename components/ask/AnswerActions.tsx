import { useEffect, useRef, useState } from 'react';
import { formatCopy } from '@/lib/copy-format';
import type { SseEvent } from '@/lib/sse/events';

type Citations = Extract<SseEvent, { event: 'citations' }>['data'];
type Meta = Extract<SseEvent, { event: 'meta' }>['data'];

export function AnswerActions({
  citations,
  passages,
  onAnother,
}: {
  citations: Citations;
  passages: Meta['passages'];
  onAnother: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );
  async function copy() {
    const value = formatCopy(citations, passages);
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const previous = document.activeElement;
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      textarea.setAttribute('aria-hidden', 'true');
      document.body.append(textarea);
      textarea.select();
      let success = false;
      try {
        // eslint-disable-next-line @typescript-eslint/no-deprecated -- required clipboard fallback, TRD §15.5
        success = document.execCommand('copy');
      } finally {
        textarea.remove();
        if (previous instanceof HTMLElement) previous.focus();
      }
      if (!success) return;
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setCopied(false);
    }, 2000);
  }
  return (
    <div className="flex flex-wrap gap-4">
      <button
        type="button"
        onClick={() => {
          void copy();
        }}
      >
        {copied ? 'Copied' : 'Copy answer'}
      </button>
      <button type="button" onClick={onAnother}>
        Ask another question
      </button>
    </div>
  );
}
