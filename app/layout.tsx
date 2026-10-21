import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { Schibsted_Grotesk, JetBrains_Mono } from 'next/font/google';
import { SkipLink } from '@/components/layout/SkipLink';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { SiteFooter } from '@/components/layout/SiteFooter';
import './globals.css';

const sans = Schibsted_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-schibsted',
  display: 'swap',
});
const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-jetbrains',
  display: 'swap',
});
const THEME_SCRIPT =
  "try { const t = localStorage.getItem('sourced-theme'); if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; } catch {}";
export const metadata: Metadata = {
  title: 'Sourced: answers that show their sources',
  icons: { icon: '/favicon.svg' },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${mono.variable}`}>
      <head>
        <script
          nonce={nonce}
          // eslint-disable-next-line react/no-danger -- constant theme script, TRD §15.3
          dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
        />
        <meta name="theme-color" content="#f6f6f3" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#111111" media="(prefers-color-scheme: dark)" />
      </head>
      <body>
        <SkipLink />
        <SiteHeader />
        <main id="content" className="shell" tabIndex={-1}>
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
