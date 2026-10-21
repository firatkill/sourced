import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import './globals.css';

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Reading headers makes every page dynamic; Next.js reads the CSP request header for its script nonces.
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html lang="en">
      <head>
        <meta name="csp-nonce" content={nonce} />
      </head>
      <body>{children}</body>
    </html>
  );
}
