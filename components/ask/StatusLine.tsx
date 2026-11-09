'use client';

export function StatusLine({ text }: { text: string }) {
  return text === '' ? null : <p className="mono text-[var(--ink-2)]">{text}</p>;
}
