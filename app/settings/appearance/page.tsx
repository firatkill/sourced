import type { Metadata } from 'next';
import { ThemePicker } from '@/components/settings/ThemePicker';
import { TextSize } from '@/components/settings/TextSize';

export const metadata: Metadata = { title: 'Appearance · Sourced' };

export default function Appearance() {
  return (
    <div className="max-w-3xl">
      <h1>Appearance</h1>
      <p className="text-[var(--ink-2)]">
        Saved in this browser. Code blocks and source highlights follow the theme.
      </p>
      <div className="mt-10 space-y-10">
        <ThemePicker />
        <TextSize />
        <section
          aria-labelledby="appearance-preview"
          className="rounded-[var(--radius-lg)] border border-[var(--rule)] bg-[var(--surface)] p-5"
        >
          <p
            id="appearance-preview"
            className="mb-3 text-xs font-semibold tracking-wide text-[var(--ink-3)] uppercase"
          >
            Preview
          </p>
          <p className="leading-relaxed">
            You need to give Acme <strong>90 days&apos; written notice</strong> to end the agreement
            for convenience.
            <span
              aria-hidden="true"
              className="ml-1 inline-flex h-6 min-w-6 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--accent-soft)] px-1.5 align-[2px] font-mono text-xs font-semibold text-[var(--accent-soft-ink)]"
            >
              1
            </span>
          </p>
          <p className="mt-3 text-sm leading-relaxed text-[var(--ink-2)]">
            <mark className="rounded-sm bg-[var(--quote)] px-0.5 text-[var(--ink)]">
              Either party may terminate this Agreement for convenience by giving not less than
              ninety (90) days&apos; prior written notice.
            </mark>
          </p>
        </section>
      </div>
    </div>
  );
}
