import { ASK_COPY, type CorpusCopy } from '@/lib/copy';
import Link from 'next/link';

export function SiteFooter({ copy = ASK_COPY }: { copy?: CorpusCopy }) {
  return (
    <footer className="site-footer small">
      <div className="shell">
        <p>
          Built by Fırat Kıl · <a href="https://firatkil.com">firatkil.com</a> ·{' '}
          <a href="https://github.com/firatkill/sourced">Source on GitHub (MIT)</a>
        </p>
        {(copy.attribution || copy.license) && (
          <p>
            {copy.attribution}
            {copy.license && (
              <>
                {copy.attribution ? ' ' : ''}
                <a href={copy.license.url}>{copy.license.name}</a>.
              </>
            )}
          </p>
        )}
        <p>
          Privacy: questions are not stored.{' '}
          <Link href="/how-it-works#privacy">Read how this works.</Link>
        </p>
      </div>
    </footer>
  );
}
