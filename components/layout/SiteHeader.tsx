import Link from 'next/link';
import { ThemeToggle } from './ThemeToggle';

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="shell">
        <Link className="mono" href="/">
          Sourced
        </Link>
        <nav aria-label="Main navigation" className="mono">
          <Link href="/">Ask</Link>
          <Link href="/eval">Evaluation</Link>
          <Link href="/how-it-works">How it works</Link>
          <a href="https://github.com/firatkill/sourced">GitHub</a>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
