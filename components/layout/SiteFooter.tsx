import { ASK_COPY } from '@/lib/copy';
import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="site-footer small">
      <div className="shell">
        <p>
          Built by Fırat Kıl · <a href="https://firatkil.com">firatkil.com</a> ·{' '}
          <a href="https://github.com/firatkill/sourced">Source on GitHub (MIT)</a>
        </p>
        {(ASK_COPY.attribution || ASK_COPY.license) && (
          <p>
            {ASK_COPY.attribution}
            {ASK_COPY.license && (
              <>
                {ASK_COPY.attribution ? ' ' : ''}
                <a href={ASK_COPY.license.url}>{ASK_COPY.license.name}</a>.
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
