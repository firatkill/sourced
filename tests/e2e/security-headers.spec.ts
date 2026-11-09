import { expect, test } from '@playwright/test';
import { load } from 'cheerio';
import { uniqueIp } from './helpers';

// TC-148 / E2E-23 / NFR-14: TRD §19 items 3–4, on local production builds.
for (const port of [3100, 3101, 3102]) {
  for (const path of ['/', '/eval', '/how-it-works', '/api/health']) {
    test(`TC-148: E2E-23 security headers on ${String(port)}${path}`, async ({
      request,
    }, testInfo) => {
      const nonces: string[] = [];
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = await request.get(`http://localhost:${String(port)}${path}`, {
          headers: { 'x-real-ip': uniqueIp(testInfo) },
        });
        expect(response.status()).toBe(200);
        const headers = response.headers();
        const policy = headers['content-security-policy'];
        expect(policy).toBeDefined();
        const nonce = policy?.match(/'nonce-([^']+)'/)?.[1];
        expect(nonce).toBeTruthy();
        if (!nonce) throw new Error('CSP must contain a nonempty nonce');
        nonces.push(nonce);
        expect(
          policy
            .split(';')
            .map((directive) => directive.trim())
            .filter(Boolean),
        ).toEqual([
          "default-src 'self'",
          `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data:",
          "font-src 'self'",
          "connect-src 'self'",
          "frame-ancestors 'none'",
          "base-uri 'none'",
          "form-action 'self'",
          "object-src 'none'",
        ]);
        expect(headers).toMatchObject({
          'strict-transport-security': 'max-age=63072000; includeSubDomains',
          'x-content-type-options': 'nosniff',
          'referrer-policy': 'strict-origin-when-cross-origin',
          'x-frame-options': 'DENY',
          'cross-origin-opener-policy': 'same-origin',
          'permissions-policy': 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
        });
        expect(headers['x-request-id']).toBeTruthy();
        if (path !== '/api/health') {
          expect(headers['content-type']).toContain('text/html');
          // Parse the response HTML: browsers hide nonce content attributes in the DOM.
          const scripts = load(await response.text())('script').toArray();
          expect(scripts.length).toBeGreaterThan(0);
          for (const script of scripts) expect(script.attribs.nonce).toBe(nonce);
        }
      }
      expect(nonces[0]).not.toBe(nonces[1]);
    });
  }
}
