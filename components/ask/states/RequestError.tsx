import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { ASK_COPY } from '@/lib/copy';

export function RequestError({
  heading,
  body,
  onRetry,
  children,
}: {
  heading: string;
  body: string;
  onRetry: () => void;
  children?: ReactNode;
}) {
  const retryRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    retryRef.current?.focus();
  }, []);
  return (
    <div className="space-y-4 rounded-md bg-[var(--danger-soft)] p-4 text-[var(--danger)]">
      <h2>{heading}</h2>
      <p>{body}</p>
      {children}
      <button
        ref={retryRef}
        type="button"
        className="min-h-6 underline underline-offset-4"
        onClick={onRetry}
      >
        {ASK_COPY.tryAgain}
      </button>
    </div>
  );
}
