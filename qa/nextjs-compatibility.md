# T-06 JavaScript-budget compatibility proposal

Status: tested in an isolated workspace copy and **approved for adoption in D-52**. Adopted in commit 3cd3bc6: main-repository automated acceptance passed at 106.3 KB and all six CI jobs passed in [run 39573125819](https://github.com/firatkill/sourced/actions/runs/39573125819).

The acceptance limit remains 120 KB gzip. Measurements include every script referenced by the built root HTML, using gzip level 9, exactly as TRD §22 prescribes. Neither the ceiling nor the measurement is weakened.

| Configuration                                       | First-load gzip |
| --------------------------------------------------- | --------------: |
| Next.js 16.4.2, original T-06 application imports   |        187.5 KB |
| Next.js 16.4.2, lean error boundary                 |        175.2 KB |
| Next.js 15.5.28, standard build                     |        144.7 KB |
| Next.js 16.4.2, Webpack with noModule asset omitted |        135.9 KB |
| Next.js 15.5.28, noModule asset omitted             |        106.3 KB |

## Approved changes

1. Pin next to 15.5.28. Keep the existing React, TypeScript, ESLint and other direct dependency pins.
2. Override only next@15.5.28>postcss to 8.5.31. The older framework otherwise brings PostCSS 8.4.31 with two high and two moderate advisories; the override produces a clean production audit.
3. Use Next.js 15's middleware.ts interception filename and export. The existing security behavior is preserved.
4. Use its required TypeScript JSX setting (preserve) and add a CSS module declaration for TypeScript 6 side-effect imports.
5. In the standard Webpack configuration hook, omit exactly the plugin emitting the legacy nomodule asset. Throw if the expected plugin is absent or matches more than once. The script is unused by NFR-18's module-capable browsers. All remaining referenced scripts still count toward the budget.

The production font implementation remains next/font/google. Early diagnostics used previously downloaded font files to avoid a transient download problem; the final 106.3 KB measurement was repeated after restoring the specified Google-font build implementation.

## Verification

- Candidate ESLint, typecheck, all 21 unit tests, integration smoke, scaffold checks and production build passed.
- Production dependency audit: no known vulnerabilities after the scoped PostCSS override.
- Built HTTP response and every referenced script return 200.
- CSP nonce changes between requests and is attached to every script.
- Chromium and WebKit theme/layout checks pass; macOS WebKit keyboard navigation uses Option+Tab to include links.
- Firefox explicit theme toggle/persistence, layout and 404 checks pass. System-dark verification remains manual by owner decision D-51 because Playwright's requested dark preference was not reflected by matchMedia.
- Main-repository scaffold, audit, nonce checks and all seven Playwright tests pass with the approved stack. All six CI jobs passed on the adopted commit.

## Approved tradeoffs

Next.js 15 is the maintenance branch, while 16 is active LTS. This is an exception to the latest-version requirement. The Webpack hook uses a documented extension mechanism but matches an internal Next.js plugin; that detail is not a stable API. The exact pin, fail-closed guard and executable size/security checks make a changed internal shape visible on an upgrade, but maintenance still requires reviewing it. The scoped PostCSS override must also be reviewed when the framework changes.

The full NFR-18 matrix (two browser versions and iOS Safari 17+) has not been certified by these engine checks. Live visual QA remains pending computer/browser access.

Sources: [Next.js support policy](https://nextjs.org/support-policy), [supported browsers and conditional polyfills](https://nextjs.org/docs/architecture/supported-browsers), [Webpack customization](https://nextjs.org/docs/app/api-reference/config/next-config-js/webpack), [patched Next.js advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw), [PostCSS advisory](https://github.com/advisories/GHSA-6g55-p6wh-862q).
