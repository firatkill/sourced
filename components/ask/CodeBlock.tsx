import { useEffect, useRef, useState } from 'react';
import { tokenizeSql } from '@/lib/highlight/sql';

export function CodeBlock({ source, language }: { source: string; language: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );
  const sql = ['', 'sql', 'psql', 'pgsql', 'postgresql'].includes(language.toLowerCase());
  async function copy() {
    try {
      await navigator.clipboard.writeText(source);
    } catch {
      return;
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setCopied(false);
    }, 2000);
  }
  return (
    <figure className="my-5 min-w-0 overflow-hidden rounded-xl border border-[var(--rule)] bg-[var(--code-bg)] text-[var(--code-ink)]">
      <figcaption className="flex h-10 items-center justify-between bg-[var(--code-bar)] px-4 font-mono text-xs">
        <span>{sql ? 'SQL' : language.toUpperCase() || 'Code'}</span>
        <button
          type="button"
          className="flex h-7 items-center rounded-[6px] border border-[var(--sql-comment)] px-2 text-xs"
          aria-label="Copy code"
          onClick={() => {
            void copy();
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </figcaption>
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-6">
        <code>
          {sql
            ? tokenizeSql(source).map((token, index) => (
                <span key={index} data-sql-token={token.type} className={`sql-${token.type}`}>
                  {token.text}
                </span>
              ))
            : source}
        </code>
      </pre>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? 'Code copied' : ''}
      </span>
    </figure>
  );
}
