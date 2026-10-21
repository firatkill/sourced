import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="site-footer small">
      <div className="shell">
        <p>
          Built by Fırat Kıl · <a href="https://firatkil.com">firatkil.com</a> ·{' '}
          <a href="https://github.com/firatkill/sourced">Source on GitHub (MIT)</a>
        </p>
        <p>
          Answers are generated from the PostgreSQL 17 documentation, © The PostgreSQL Global
          Development Group, used under the{' '}
          <a href="https://www.postgresql.org/about/licence/">PostgreSQL License</a>.
        </p>
        <p>
          Privacy: questions are not stored.{' '}
          <Link href="/how-it-works#privacy">Read how this works.</Link>
        </p>
      </div>
    </footer>
  );
}
