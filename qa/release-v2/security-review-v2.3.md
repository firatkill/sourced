# Security review: Setup and Settings (v2.3)

Reviewer: Claude (code review of `v2.3/setup-settings`, 2026-11-20). Scope: T-88 to T-92, the routes in TRD §43.3, the middleware checks in TRD §43.2, the launchers' `dev` and `setup`, and the setup pages.

## Threats and controls

| Threat                                                       | Control                                                                                                                                                                                                                    | Evidence                                                                         |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Another site drives the local app through the browser (CSRF) | Setup and Settings need the `sourced_setup` cookie (`SameSite=Strict`); every mutation needs a same-host `Origin`, and a missing `Origin` is refused                                                                       | `tests/integration/setup-api.test.ts` (guards), `tests/e2e/setup.spec.ts` (T-88) |
| DNS rebinding to `127.0.0.1:<port>`                          | Middleware refuses any `Host` but loopback names and `ALLOWED_ORIGINS` hosts, in the local profile, before any route                                                                                                       | `tests/unit/setup-guard.test.ts`, E2E T-88                                       |
| Someone else on the machine or network opens setup           | Port bound to `127.0.0.1`; setup needs the token printed in the terminal (24 random bytes, file mode 0600, compared in constant time); the cookie holds only its hash; `./sourced setup` revokes earlier links and cookies | unit token tests, launcher contract tests                                        |
| The token leaks from the URL                                 | Middleware redirects to `/setup` at once, so the page never renders with the token; `Referrer-Policy: strict-origin-when-cross-origin`; no request logging of URLs                                                         | unit exchange test                                                               |
| A key leaks through a response, an error or a log            | Responses carry only the masked key; errors use fixed messages; the setup wrapper logs only the error code and type; the key check's provider errors are not passed on                                                     | integration test greps every stdout line and response body for the key           |
| A key value rewrites other settings in `.env.local`          | Allow-listed names only; values are printable ASCII without whitespace, quotes, `$`, `#` or backslashes; atomic write, mode 0600                                                                                           | `tests/unit/setup-helpers.test.ts`                                               |
| Upload writes outside `my-docs/`                             | Relative-path check (no `..`, hidden parts or absolute paths), resolved-path prefix check, and a real-path check of the parent folder (no symlinked folder)                                                                | integration tests (traversal, hidden, symlink)                                   |
| Spending money without consent                               | Only the key check (free list-models) calls a provider before the Index step's confirm; ingest and rebuild need `confirm: true`                                                                                            | integration and E2E flows                                                        |
| Concurrent ingests corrupt the index                         | One job per server process; a second start returns the running job; the embedding change refuses while a job runs                                                                                                          | integration test                                                                 |
| Settings in the hosted demo or the private profile           | Every route returns 404 outside `local`; pages redirect to Appearance                                                                                                                                                      | integration guard test                                                           |

## Findings fixed during the review

- Uploads followed a symlinked folder inside `my-docs/`; a real-path check now refuses it.
- The SSE progress stream could throw after the tab closed; it now stops on cancel.

## Known limits (accepted)

- The 200 MB upload limit trusts `Content-Length`; a chunked upload is read into memory. Only a person holding the setup cookie can send one.
- A CLI `ingest` started at the same time as a browser-started job is not blocked; the CLI and the browser are the same person on the same machine.
- Adding a URL fetches it (and its sitemap) from the server; this is the person's own request, as with `./sourced add`.
- The setup link stays in the browser history until `./sourced setup` replaces it.
