import { CONFIGURATION_COPY } from '@/lib/copy';
import { ConfigurationError } from '@/components/layout/ConfigurationError';
import { readAppConfiguration } from '@/lib/kit/app-configuration';
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { SkipLink } from '@/components/layout/SkipLink';
import { PageShell } from '@/components/layout/PageShell';
import { SiteFooter } from '@/components/layout/SiteFooter';
import './globals.css';

const sans = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
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
export function generateMetadata(): Metadata {
  const configuration = readAppConfiguration();
  if (!configuration.ok) return { title: CONFIGURATION_COPY.heading };
  return {
    metadataBase: new URL(configuration.env.NEXT_PUBLIC_SITE_URL),
    title: configuration.copy.documentTitle,
    icons: { icon: '/favicon.svg' },
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const configuration = readAppConfiguration();
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${mono.variable}`}>
      <head>
        <script
          nonce={nonce}
          suppressHydrationWarning
          // eslint-disable-next-line react/no-danger -- constant theme script, TRD §15.3
          dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
        />
        <meta name="theme-color" content="#f6f6f3" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#111111" media="(prefers-color-scheme: dark)" />
      </head>
      <body>
        <SkipLink />
        {configuration.ok ? (
          <PageShell footer={<SiteFooter copy={configuration.copy} />}>{children}</PageShell>
        ) : (
          <ConfigurationError fixes={configuration.fixes} />
        )}
      </body>
    </html>
  );
}
