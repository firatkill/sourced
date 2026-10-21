# Sourced: Implementation Plan

Ordered tasks to build Sourced from an empty folder to a deployed v1.0.0. Read `AGENTS.md` first, then `docs/PRD.md` (what) and `docs/TRD.md` (how). This plan says in what order and how to know each step is done.

## How to use this plan

- Do tasks in ID order unless the "Depends on" line allows otherwise. One task is one branch and one pull request (or a short series of small commits on `main` before the first deploy, if working alone; see AGENTS.md).
- Each task lists the requirements it implements (FR/NFR), the files it touches, steps, and acceptance criteria. A task is done only when every acceptance command passes and the Definition of Done in AGENTS.md holds.
- "TRD §n" means section n of `docs/TRD.md`. Test IDs (UT-, IT-, E2E-) are defined in TRD §23.
- Every acceptance list implicitly includes: `pnpm lint && pnpm typecheck && pnpm test` pass. From T-05 on it also includes `pnpm test:integration` (with `pnpm db:up`), and from T-34 on `pnpm test:e2e`.
- When a task requires verifying an assumption (TRD §24, A-xx), record the result as a new row in the PRD decisions log in the same pull request.

## Milestone overview

| Milestone | Tasks | Exit criteria |
|---|---|---|
| M0 Setup | T-01 – T-06 | Tooling, CI skeleton, DB, migrations framework, test runners, layout shell |
| M1 Ingestion and search | T-07 – T-17 | Corpus ingested idempotently; hybrid search verified by integration tests |
| M2 Ask, stream, citations | T-18 – T-34 | `/api/ask` streams verified answers; every ask page state covered by E2E |
| M3 Eval and CI | T-35 – T-39 | `pnpm eval` passes floors; eval workflow; `/eval` and `/how-it-works` pages |
| M4 Polish and deploy | T-40 – T-45 | Accessibility, security, production deploy, README, release |

---

## M0 Setup

### T-01 Scaffold the repository, tooling and CI skeleton

- **Goal**: An empty Next.js app with strict TypeScript, Tailwind v4, shadcn/ui, ESLint, Prettier, pnpm scripts and a CI workflow running lint, typecheck and build.
- **Implements**: D-01, NFR-17; A-10, A-16
- **Files**: `package.json`, `pnpm-lock.yaml`, `.nvmrc`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `postcss.config.mjs`, `components.json`, `.gitignore`, `LICENSE`, `app/layout.tsx`, `app/page.tsx` (placeholder H1), `app/globals.css`, `.github/workflows/ci.yml` (jobs `lint`, `typecheck`, `build` only for now), `README.md` (one-paragraph stub).
- **Steps**:
  1. Do not run `git init` if the folder is already a repository. Create the Next.js app with the official create command for the installed major (App Router, TypeScript, Tailwind, ESLint, no `src/` dir, import alias `@/*`), using pnpm.
  2. For every dependency in TRD §2, run `pnpm view <pkg> version` and pin the exact version (no `^`/`~`). Set `"packageManager": "pnpm@<exact>"` and `"engines": { "node": ">=22" }`. Write `.nvmrc` with `22`.
  3. Set the tsconfig options from TRD §2 (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`).
  4. ESLint flat config: `eslint-config-next`, `typescript-eslint` strict type-checked rules, `@typescript-eslint/no-explicit-any: error`, `react/no-danger: error`, `no-console: error` (allow in `scripts/`), `no-restricted-imports` placeholders for TRD §8.
  5. Prettier config from TRD §3. Run `pnpm format`.
  6. `pnpm dlx shadcn@latest init` with the `components.json` values in TRD §3; add `button`, `textarea`, `badge`, `collapsible`, `table`, `tooltip`, `separator`.
  7. Add all scripts from TRD §3.1 (some point to files created later; that is fine as long as `lint`, `typecheck`, `build` work now).
  8. Confirm Next.js major and the name of the interception file (`middleware.ts` or `middleware.ts`) in the installed docs (A-10). Note it in the PRD decisions log.
  9. Verify the `react-server` condition approach for scripts (TRD §3.1 last paragraph). Record the result.
  10. Write `ci.yml` with the `lint`, `typecheck` and `build` jobs exactly as in TRD §25.1 (other jobs added in T-05). Check current majors of the actions (A-16).
  11. `LICENSE`: MIT, "Copyright (c) 2026 Fırat Kıl".
  12. On GitHub (manual, owner): enable Dependabot alerts, secret scanning and push protection.
- **Acceptance**:
  - `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm build` exits 0.
  - `grep -E '"[\^~]' package.json` prints nothing.
  - `pnpm exec tsx --conditions=react-server -e "import('server-only').then(()=>console.log('ok'))"` prints `ok` (or the fallback in TRD §3.1 is in place and recorded).
  - CI run on GitHub is green.
- **Depends on**: —

### T-02 Configuration, environment and error codes

- **Goal**: Typed constants, validated env, shared error codes.
- **Implements**: TRD §4, §5, §18; FR-30 (env shape), FR-54 (flag), FR-55 (mode flag)
- **Files**: `lib/config.ts`, `lib/env.ts`, `lib/errors.ts`, `lib/suggested.ts`, `lib/time.ts`, `lib/hash.ts`, `.env.example`, `tests/unit/env.test.ts` (UT-17), `tests/unit/suggested.test.ts` (UT-19, `matchSuggested` stubbed until T-23 provides `normalize`; implement a local normalize call once T-23 lands), `vitest.config.ts` (unit project only for now), `tests/setup/env.ts`, `tests/setup/empty.ts`.
- **Steps**:
  1. Copy `lib/config.ts` from TRD §4 verbatim.
  2. Implement `lib/env.ts` with Zod per TRD §5, lazy memoized `getEnv()`, `resetEnvForTests()` exported only for tests.
  3. Implement `lib/errors.ts` per TRD §18.
  4. Implement `lib/suggested.ts` per TRD §11.2.
  5. `lib/time.ts`: `utcDate(now)` → `YYYY-MM-DD`, `nextUtcMidnight(now)`. `lib/hash.ts`: `sha256Hex`, `hmacSha256Hex` with `node:crypto`.
  6. Write `.env.example` with every variable, example values, and comments; `CHAT_MODEL`/`JUDGE_MODEL` say `# pinned in T-18`. It must work unchanged for the no-API-key setup: local Docker `DATABASE_URL`/`TEST_DATABASE_URL`, `NEXT_PUBLIC_SITE_URL=http://localhost:3000`, development-only salts of ≥ 32 characters (TRD §5).
  7. Vitest: unit project, `environment: 'node'`, alias `server-only` → `tests/setup/empty.ts`, setup file sets `LLM_MODE=mock` and a fetch guard that throws for non-localhost URLs.
- **Acceptance**:
  - `pnpm test` runs UT-17 and passes, including "mock forbidden when VERCEL_ENV=production" and "error message lists names, not values".
  - Every variable in TRD §5 appears in `.env.example` (`node -e` script or test that parses both and compares names; add it to UT-17).
  - UT-17 also asserts that `getEnv()` succeeds with `LLM_MODE=mock` and only the values from `.env.example`.
- **Depends on**: T-01

### T-03 Logging, request id and security headers

- **Goal**: JSON logs with request id; CSP nonce and security headers on every response.
- **Implements**: FR-52, NFR-14; TRD §19, §20.1; D-15
- **Files**: `lib/logger.ts`, `middleware.ts` (or `middleware.ts`), `app/layout.tsx` (read nonce from `headers()`), `next.config.ts` (`poweredByHeader: false`), `tests/unit/logger.test.ts`.
- **Steps**:
  1. pino logger per TRD §20.1 with redaction; `withRequest(requestId)`.
  2. `middleware.ts`: always generate a fresh `requestId = crypto.randomUUID()` (overwrite any incoming `x-request-id`) and a base64 nonce from 16 random bytes; set request headers `x-request-id`, `x-nonce` and `Content-Security-Policy` (so Next.js applies the nonce to its own scripts); set response headers from TRD §19 (CSP with nonce; `'unsafe-eval'` only when `NODE_ENV === 'development'`; `upgrade-insecure-requests` only when `VERCEL_ENV` is set; read both through `getEnv()`). Matcher excludes `_next/static`, `_next/image`, `favicon.svg`. `middleware.ts` imports only `lib/env.ts` and `lib/config.ts` (TRD §8).
  3. Layout reads `x-nonce` and passes it to the theme script (added in T-06) and to Next's script handling as documented for the installed version.
- **Acceptance**:
  - `pnpm build && pnpm start` then `curl -sI http://localhost:3000 | grep -iE 'content-security-policy|x-request-id|strict-transport|x-frame-options'` shows all four headers; two requests show different nonces.
  - Browser console on `/` shows no CSP violations (manual check, note it in the PR).
  - Logger unit test asserts JSON output contains `requestId` and that a `question` field is redacted.
- **Depends on**: T-02

### T-04 Local database, Drizzle and the extensions migration

- **Goal**: Postgres with pgvector in Docker; Drizzle wired; first migration creates the extension.
- **Implements**: D-02; A-15
- **Files**: `docker-compose.yml`, `docker/initdb/01-create-test-db.sql`, `drizzle.config.ts`, `lib/db/client.ts`, `lib/db/schema.ts` (empty export for now), `drizzle/0000_extensions.sql` (+ meta), `scripts/db-reset.ts`.
- **Steps**:
  1. `docker-compose.yml`: service `db`, image `pgvector/pgvector:pg17`, env user/password/db `sourced`, port `5433:5432`, volume `pgdata`, healthcheck `pg_isready -U sourced -d sourced`, mount `docker/initdb` to `/docker-entrypoint-initdb.d`.
  2. `drizzle.config.ts` per TRD §3.
  3. `lib/db/client.ts` per TRD §6.2.
  4. `pnpm drizzle-kit generate --custom --name extensions`; write `CREATE EXTENSION IF NOT EXISTS vector;`.
  5. `scripts/db-reset.ts`: refuses unless the URL host is `localhost` or `127.0.0.1`; drops and recreates schema `public` and `drizzle`, then runs migrations.
- **Acceptance**:
  - `pnpm db:up && pnpm db:migrate` exits 0.
  - `docker compose exec db psql -U sourced -d sourced -c "SELECT extversion FROM pg_extension WHERE extname='vector'"` prints a version ≥ 0.8.0.
  - `psql` against `sourced_test` database succeeds (created by init script).
- **Depends on**: T-02

### T-05 Test runners and full CI

- **Goal**: Vitest unit and integration projects with coverage thresholds; Playwright configured with two groups; CI with all jobs.
- **Implements**: TRD §23.2, §23.4, §23.5, §25.1
- **Files**: `vitest.config.ts`, `tests/setup/integration-global-setup.ts`, `tests/setup/integration-setup.ts`, `tests/integration/smoke.test.ts`, `playwright.config.ts`, `tests/e2e/global-setup.ts`, `tests/e2e/smoke.spec.ts`, `.github/workflows/ci.yml` (add `unit`, `integration`, `e2e` jobs).
- **Steps**:
  1. Vitest `projects`: `unit` (`tests/unit/**/*.test.{ts,tsx}`, node env) and `integration` (`tests/integration/**/*.test.ts`; env setup copies `TEST_DATABASE_URL` into `DATABASE_URL`; global setup migrates it and refuses non-local hosts; setup file truncates tables per file; `poolOptions.forks.singleFork: true`, `testTimeout: 30_000`, `hookTimeout: 60_000`). Set `esbuild: { jsx: 'automatic' }` (TRD §2).
  2. Coverage config and thresholds from TRD §23.5 (thresholds may fail until code exists; set `thresholds.autoUpdate: false` and add files as they appear; the global threshold is enforced from T-17 on, per-file thresholds from the task that creates each file).
  3. Playwright config exactly as TRD §23.4 (three web servers; `.env.local` loading; `globalSetup` that deletes `rate_limits` rows on local hosts and is a no-op while the table does not exist; `smoke.spec.ts` checks `/` returns 200 and the H1 placeholder, and is updated in T-31 when the real H1 lands). Until `/api/health` exists (T-29) use `url: http://localhost:<port>` and switch in T-29.
  4. Check the user-level Playwright rules: `expect.timeout` 3000, `timeout` 90_000, `parallel` and `isolated` projects. They are already in the TRD config; do not change them.
  5. Complete `ci.yml` per TRD §25.1. The `e2e` job's `pnpm db:seed` step is added in T-16; until then, omit that step.
- **Acceptance**:
  - `pnpm test`, `pnpm test:integration` (smoke test runs `SELECT 1`), `pnpm build && pnpm test:e2e` all exit 0 locally.
  - CI shows six green jobs: lint, typecheck, unit, integration, e2e, build.
- **Depends on**: T-03, T-04

### T-06 Design tokens, fonts, layout shell and theme

- **Goal**: The visual system and the global layout (header, nav, footer, skip link, theme toggle) on every page.
- **Implements**: FR-49, FR-50, NFR-09 (landmarks), PRD §9.1; TRD §15.2, §15.3
- **Files**: `app/globals.css`, `app/layout.tsx`, `components/layout/SiteHeader.tsx`, `SiteFooter.tsx`, `SkipLink.tsx`, `ThemeToggle.tsx`, `app/not-found.tsx`, `app/error.tsx`, `public/favicon.svg`, placeholder `app/eval/page.tsx`, `app/how-it-works/page.tsx` (H1 only), `tests/e2e/theme.spec.ts` (E2E-20, partial: toggle and persistence).
- **Steps**:
  1. Tokens and `@theme inline` from TRD §15.2; type scale and gutters.
  2. `next/font/google` for Schibsted Grotesk and JetBrains Mono with CSS variables `--font-schibsted`, `--font-jetbrains`.
  3. Theme script with nonce in `<head>`, rendered exactly as TRD §15.3 (the one allowed `dangerouslySetInnerHTML`, with its ESLint disable comment); `ThemeToggle` with accessible names from PRD §9.1.
  4. Header, nav, footer copy exactly as PRD §9.1; footer links.
  5. 404 and error boundary copy from PRD §9.7.
- **Acceptance**:
  - E2E-20 passes (toggle, persistence, system dark).
  - `/does-not-exist` shows "Page not found".
  - First-load JS for `/` ≤ 120 KB gzip at this stage, measured with the command in TRD §22.
- **Depends on**: T-03, T-05

---

## M1 Ingestion and search

### T-07 Core schema: documents and chunks

- **Goal**: `documents` and `chunks` tables with HNSW and GIN indexes exactly as TRD §6.1.
- **Implements**: D-02, D-13; TRD §6.1 (0001)
- **Files**: `lib/db/schema.ts`, `drizzle/0001_core.sql` (+ meta), `tests/integration/migrations.test.ts` (IT-03, documents/chunks part).
- **Steps**:
  1. Drizzle schema with `customType` for `tsvector` (generated), `vector('embedding', { dimensions: 1536 })`, the HNSW index with `.with({ m: 16, ef_construction: 64 })`, deferrable unique constraint.
  2. `pnpm db:generate --name core` (so the file is `0001_core.sql`); diff against TRD DDL; hand-edit the SQL so it matches (generated column expression, `DEFERRABLE INITIALLY DEFERRED`, CHECK constraints).
  3. `ingest_runs` table is also in 0001 per TRD; include it.
- **Acceptance**:
  - `pnpm db:reset` then IT-03 passes: `pg_indexes.indexdef` for `chunks_embedding_hnsw_idx` contains `hnsw`, `vector_cosine_ops`, `m='16'`, `ef_construction='64'`; inserting a chunk populates `tsv`.
  - `pnpm db:generate` after the hand edit reports no schema changes.
- **Depends on**: T-04

### T-08 Operational tables

- **Goal**: `answer_cache`, `rate_limits`, `query_log`.
- **Implements**: TRD §6.1 (0002); FR-26–FR-29, FR-53
- **Files**: `lib/db/schema.ts`, `drizzle/0002_ops.sql` (generated with `pnpm db:generate --name ops`, hand-edited to match TRD §6.1), `tests/integration/migrations.test.ts` (rest of IT-03).
- **Acceptance**: IT-03 asserts all six tables, their primary keys and CHECK constraints exist; `pnpm db:generate` reports no changes.
- **Depends on**: T-07

### T-09 Corpus manifest, license files and injection fixture

- **Goal**: The pinned page list, verified to exist, plus attribution files and the fixture page.
- **Implements**: FR-33 (manifest), FR-39, FR-50, D-04, D-05; A-12, A-14; PRD §9.8; TRD §10.1, §10.9
- **Files**: `corpus/manifest.json`, `corpus/LICENSE-POSTGRESQL.txt`, `NOTICE`, `corpus/fixtures/injected-notice.html`, `lib/ingest/manifest.ts`, `tests/unit/manifest.test.ts` (UT-29).
- **Steps**:
  1. Write the manifest from TRD §10.1.
  2. For each page, request the URL once with a 2 s pause between requests (a throwaway script in the scratch area, not committed) and confirm HTTP 200 with the expected title. Replace any failing page per TRD §10.1 and record it.
  3. Copy the PostgreSQL License text verbatim from https://www.postgresql.org/about/licence/ into `corpus/LICENSE-POSTGRESQL.txt`. Write `NOTICE`.
  4. Write the fixture HTML per TRD §10.9, structured like a real page (`#docContent > div.sect1#INJECTED-NOTICE`).
  5. Manifest Zod schema and loader.
- **Acceptance**: UT-29 passes; `node -e "const m=require('./corpus/manifest.json');console.log(m.pages.length)"` prints a number from 30 to 40.
- **Depends on**: T-02

### T-10 Fetcher with robots.txt and rate limiting

- **Goal**: Fetch and cache raw HTML politely; commit the raw files.
- **Implements**: FR-33, D-05, NFR-16; A-13; TRD §10.2
- **Files**: `lib/ingest/robots.ts`, `lib/ingest/fetch.ts`, `scripts/ingest.ts` (CLI skeleton with `--fetch-only`, `--refresh`, `--offline`), `tests/unit/fetch.test.ts` (UT-30), `corpus/raw/*.html`.
- **Steps**:
  1. Read https://www.postgresql.org/robots.txt (A-13). If `/docs/` is disallowed for generic agents, stop and raise it with the owner.
  2. Implement fetcher rules 1–6 of TRD §10.2 with an injectable `fetchImpl` and clock for tests.
  3. CLI flags; `--fetch-only` exits after fetching.
  4. Run `pnpm corpus:fetch` once. Commit `corpus/raw/`.
- **Acceptance**:
  - UT-30 passes.
  - `pnpm corpus:fetch` prints `unchanged` for every page on a second run and takes ≥ 2 s × pages only when fetching (it skips cached pages without requests).
  - `ls corpus/raw | wc -l` equals the manifest page count; `du -sh corpus/raw` ≤ 10 MB.
- **Depends on**: T-09

### T-11 HTML parser

- **Goal**: Raw HTML → section tree of blocks with ids and heading text.
- **Implements**: FR-34; A-12; TRD §10.3
- **Files**: `lib/ingest/parse-html.ts`, `tests/fixtures/html/*.html` (3 trimmed real pages: `indexes-partial.html`, `transaction-iso.html`, `datatype-json.html`, cut to a few sections each, plus a synthetic page with table, dl, note, nested sections, missing ids), `tests/unit/parse-html.test.ts` (UT-02).
- **Steps**:
  1. Open three raw files and confirm where section ids live; adjust selectors; record the finding as a comment.
  2. Implement rules 1–8 of TRD §10.3.
  3. Snapshot-free assertions: section ids, headings, block kinds and texts for the fixtures.
- **Acceptance**: UT-02 passes; a one-off run over all `corpus/raw` files (`pnpm ingest --dry-run`, after T-12) reports zero pages with fallback to `body`.
- **Depends on**: T-10

### T-12 Tokenizer and structure-aware chunker

- **Goal**: Deterministic chunks with the invariants of TRD §10.4.
- **Implements**: FR-35, D-06, D-08, NFR-16; TRD §10.4
- **Files**: `lib/ingest/tokenizer.ts`, `lib/ingest/chunk.ts`, `tests/unit/tokenizer.test.ts` (UT-01), `tests/unit/chunk.test.ts` (UT-03), `tests/unit/content-hash.test.ts` (UT-04).
- **Steps**:
  1. Tokenizer singleton with `cl100k_base`.
  2. Implement the pseudocode exactly, including tiny-chunk merge and overlap rules.
  3. Content hash per TRD §6.1 notes.
  4. Add `--dry-run` to the CLI: parse + chunk all raw pages, print chunk count, token histogram (min, p50, p95, max) and projected embedding cost.
- **Acceptance**:
  - UT-01, UT-03, UT-04 pass; per-file coverage for `chunk.ts` ≥ 90% lines.
  - `pnpm ingest --dry-run --offline` prints a report where max tokens ≤ 800 and running it twice prints the same `corpus_version` preview hash.
- **Depends on**: T-11

### T-13 Embedding provider (live and mock) with batching and retry

- **Goal**: `embed()` for live OpenAI and the deterministic mock; batched embedding with retry and backoff.
- **Implements**: FR-36, FR-55 (embeddings), D-03, D-14; A-05; TRD §10.5, §13.0, §23.3
- **Files**: `lib/llm/types.ts` (full interface), `lib/llm/feature-hash.ts`, `lib/llm/mock.ts` (embed only for now), `lib/llm/openai.ts` (embed only), `lib/llm/index.ts`, `lib/ingest/embed-batch.ts`, `tests/unit/feature-hash.test.ts` (UT-27), `tests/unit/embed-batch.test.ts`.
- **Steps**:
  1. Interface from TRD §13.0.
  2. Feature hashing per TRD §23.3.
  3. OpenAI `embed` via AI SDK `embedMany` with `dimensions: 1536`, `maxRetries: 0` (A-05, A-11).
  4. `embedBatches` per TRD §10.5 with an injectable sleep for tests.
- **Acceptance**: UT-27 and `embed-batch.test.ts` pass (retries on 429 with `Retry-After`, fails fast on 400, preserves order, validates dimension).
- **Depends on**: T-12

### T-14 Idempotent upsert, ingest runs and the ingest CLI

- **Goal**: `pnpm ingest` writes documents and chunks idempotently and reports counts.
- **Implements**: FR-37, FR-38, FR-39, D-21; TRD §10.6–§10.8
- **Files**: `lib/ingest/upsert.ts`, `lib/ingest/report.ts`, `scripts/ingest.ts`, `tests/integration/ingest.test.ts` (IT-04), `tests/integration/ingest-idempotent.test.ts` (IT-05).
- **Steps**:
  1. Implement the run order of TRD §10.6 (steps 1–8), including the separate `UPDATE` for unchanged rows and the re-embedding of chunks whose `embedding_model` differs from the current mode's (D-25).
  2. Fixture inclusion via env or `--include-fixtures`.
  3. Report format TRD §10.8.
  4. Refuse to run when `VERCEL` is set.
- **Acceptance**:
  - IT-04 and IT-05 pass (mock embeddings; spy confirms zero embedding calls on the second run).
  - Locally: `LLM_MODE=mock pnpm ingest --offline` twice; the second report shows `0 inserted 0 updated 0 deleted`.
  - IT-05 also asserts that re-ingesting the same pages under a different embedding model id re-embeds every chunk.
- **Depends on**: T-08, T-13

### T-15 Hybrid search SQL and reference RRF

- **Goal**: The single-statement hybrid search and its TypeScript reference.
- **Implements**: FR-12, D-13, NFR-06; TRD §9.2, §9.3
- **Files**: `lib/retrieval/types.ts`, `lib/retrieval/search.ts`, `lib/retrieval/rrf.ts`, `tests/fixtures/search-fixture.ts`, `tests/unit/rrf.test.ts` (UT-05), `tests/integration/search-sql.test.ts` (IT-01), `tests/integration/search-vs-reference.test.ts` (IT-02).
- **Steps**:
  1. Implement SQL exactly as TRD §9.2 inside `sql.begin` with `SET LOCAL hnsw.ef_search`.
  2. Implement `rrfMerge` with identical tie-break.
  3. Build the fixture per TRD §23.2; tune FTS text until IT-01's FTS order assertion holds.
  4. Run `EXPLAIN (ANALYZE, BUFFERS)` of the vector CTE on the mock-ingested corpus and paste the plan into the PR description. With fewer than a few thousand rows the planner may choose a sequential scan; also run with `SET enable_seqscan = off` to show the index is usable.
- **Acceptance**: UT-05, IT-01, IT-02 pass; per-file coverage for `rrf.ts` ≥ 90%.
- **Depends on**: T-14

### T-16 Seed script for development, CI and E2E

- **Goal**: `pnpm db:seed` prepares a usable database without any API key.
- **Implements**: FR-55, G-5
- **Files**: `scripts/seed.ts`, `.github/workflows/ci.yml` (add `pnpm db:seed` to `e2e` job).
- **Steps**:
  1. `seed.ts` runs the ingest pipeline with `LLM_MODE=mock`, `--offline`, fixtures excluded. Suggested-cache seeding is added in T-26 (leave a clearly named function call that is a no-op until then).
  2. Print the report.
- **Acceptance**: `pnpm db:reset && pnpm db:seed` exits 0, `SELECT count(*) FROM chunks` > 200 and equals the total in the printed report, and `SELECT count(DISTINCT embedding_model) FROM chunks` returns 1 (`mock-feature-hash`).
- **Depends on**: T-14

### T-17 Real ingestion dry run against local Postgres

- **Goal**: Validate the corpus with live embeddings once, locally.
- **Implements**: FR-36–FR-38; NFR-16
- **Files**: none committed except fixes found; `README.md` gets a "Corpus" note with chunk count.
- **Steps**:
  1. Requires `OPENAI_API_KEY` and `PRICE_EMBED_PER_MTOK` (embeddings only). `getEnv()` also requires `CHAT_MODEL` and `PRICE_CHAT_*` in live mode, which are pinned only in T-18: until then set `CHAT_MODEL` to any id returned by `GET /v1/models` and the chat prices to that model's listed prices in `.env.local` (ingest never calls the chat model). `pnpm db:reset && pnpm ingest --offline`.
  2. Record total chunks, tokens, cost and duration in the PR description.
  3. Run again; confirm zero embedding calls.
  4. Enable the global coverage threshold from now on.
- **Acceptance**: Second run report shows `0 inserted`; `pnpm test:coverage` meets global thresholds for existing `lib/` code.
- **Depends on**: T-15, T-16

---

## M2 Ask, stream, citations

### T-18 Chat provider (live and mock) and model pinning

- **Goal**: `streamText` and `generateObject` for OpenAI and the mock; pinned model ids and prices.
- **Implements**: FR-55, FR-56, D-03, D-19; A-01, A-03, A-04, A-11; TRD §13.0, §23.3
- **Files**: `lib/llm/openai.ts`, `lib/llm/mock.ts`, `lib/llm/index.ts`, `.env.example`, `tests/unit/mock-provider.test.ts`.
- **Steps**:
  1. Look up the current small, cheap chat model (A-01). Prefer non-reasoning. Pin the exact id in `.env.example` with `# Pinned on <date> from <url>`. Record prices (A-04) in `.env.example` comments and the decisions log.
  2. Check `temperature` support and reasoning-token behaviour (A-03); set `MODEL_SUPPORTS_TEMPERATURE` and reasoning options.
  3. Implement OpenAI `streamText` and `generateObject` (or the v6 equivalent) with `maxRetries: 0`, abort signals and usage mapping.
  4. Implement every mock script in TRD §23.3.
- **Acceptance**: `mock-provider.test.ts` covers every trigger in the table; a manual live call script (scratch, not committed) streams text with the pinned model; ids and prices are in `.env.example`.
- **Depends on**: T-13

### T-19 Prompts, sanitization and prompt versioning

- **Goal**: All prompt texts and builders exactly as TRD §13.
- **Implements**: FR-15, FR-16, FR-17; TRD §13.1–§13.5
- **Files**: `lib/prompts/system.ts`, `rerank.ts`, `quotes.ts`, `judge.ts`, `sanitize.ts`, `version.ts`, `tests/unit/prompts.test.ts` (UT-10), `tests/unit/prompt-version.test.ts` (UT-11).
- **Acceptance**: UT-10 and UT-11 pass; the system prompt string in code is byte-identical to TRD §13.1 (UT-11 compares against a copy of the text stored in the test).
- **Depends on**: T-18

### T-20 Reranker with timeout and fallback

- **Goal**: Listwise rerank with all fallback paths.
- **Implements**: FR-13; TRD §9.4
- **Files**: `lib/retrieval/rerank.ts`, `tests/unit/rerank.test.ts` (UT-06).
- **Acceptance**: UT-06 passes including timeout via fake timers and the ≤ 6 candidates shortcut.
- **Depends on**: T-19, T-15

### T-21 Retrieval pipeline

- **Goal**: `retrieve(question)` → `RetrievalResult` (embed, search, rerank, select 6).
- **Implements**: FR-12–FR-14; TRD §7, §9.1, §9.5
- **Files**: `lib/retrieval/embed-query.ts`, `lib/retrieval/pipeline.ts`, `tests/integration/pipeline.test.ts`.
- **Acceptance**: Integration test (mock; the test ingests the `tests/fixtures/html` pages in `beforeAll`, TRD §23.2): returns ≤ 6 passages labelled P1..Pn, `officialUrl` includes the section fragment, timings present, `rerankFallback` false in mock.
- **Depends on**: T-20

### T-22 Stream splitter

- **Goal**: Delimiter holdback splitter.
- **Implements**: FR-19; TRD §14.1
- **Files**: `lib/generation/stream-splitter.ts`, `tests/unit/stream-splitter.test.ts` (UT-07).
- **Acceptance**: UT-07 passes, including the loop over every split position of a sample answer + delimiter + block; per-file coverage ≥ 90%.
- **Depends on**: T-02

### T-23 Citation normalizer, parser and verifier

- **Goal**: Verification exactly per TRD §14.2–§14.3, with quote spans.
- **Implements**: FR-18–FR-22, D-22; TRD §14.2, §14.3
- **Files**: `lib/citations/normalize.ts`, `parse.ts`, `verify.ts`, `tests/unit/normalize.test.ts` (UT-08), `tests/unit/citations.test.ts` (UT-09); finish `lib/suggested.ts` `matchSuggested` and UT-19.
- **Acceptance**: UT-08, UT-09, UT-19 pass; per-file coverage for `lib/citations/**` ≥ 90%.
- **Depends on**: T-22

### T-24 SSE events, encoder and client parser

- **Goal**: Shared event schemas, server encoder, incremental client parser.
- **Implements**: FR-23, FR-25; TRD §12
- **Files**: `lib/sse/events.ts`, `encode.ts`, `parse.ts`, `tests/fixtures/sse-streams.ts`, `tests/unit/sse-encode.test.ts` (UT-12), `sse-events.test.ts` (UT-13), `sse-parse.test.ts` (UT-14).
- **Acceptance**: UT-12–UT-14 pass; per-file coverage for `lib/sse/**` ≥ 90%.
- **Depends on**: T-02

### T-25 Rate limiter and visitor hashing

- **Goal**: Atomic per-visitor and global daily quotas with refund.
- **Implements**: FR-26, FR-27, FR-28, FR-32, D-10, D-11; TRD §16.1, §16.2
- **Files**: `lib/ratelimit/ip.ts`, `lib/ratelimit/limiter.ts`, `tests/unit/ip.test.ts` (UT-15), `tests/integration/rate-limit.test.ts` (IT-06).
- **Acceptance**: UT-15 and IT-06 pass, including the 50-concurrent-requests case producing exactly 10 successes.
- **Depends on**: T-08

### T-26 Answer orchestration, answer cache and `pnpm cache:suggested`

- **Goal**: `answerQuestion()` used by route and eval; cache write/lookup/replay; the cache script; seed includes mock cache.
- **Implements**: FR-09, FR-22, FR-29, FR-31; TRD §14.4, §16.3, §21.1
- **Files**: `lib/generation/answer.ts`, `lib/cost/estimate.ts` (needed by `answerQuestion` for `done.costUsdEstimate`), `lib/cache/answer-cache.ts`, `scripts/cache-suggested.ts`, `scripts/seed.ts` (call cache seeding with `--mock`), `tests/unit/cost.test.ts` (UT-16), `tests/unit/script-imports.test.ts` (UT-24), `tests/integration/answer.test.ts`, `tests/integration/answer-cache.test.ts` (IT-07).
- **Steps**:
  1. Implement `answerQuestion` per TRD §14.4 with an `emit` callback and full outcome object.
  2. Quote fallback via `lib/prompts/quotes.ts` when the block is missing.
  3. Cache module per TRD §16.3; replay function emits events through the same `emit` interface.
  4. Script per TRD §16.3.
- **Acceptance**: `answer.test.ts` (mock) asserts event order meta → token+ → citations → done for the default script, not-found for `mock:not-found`, removal of exactly 2 citations for `mock:invalid-citation`, fallback for `mock:no-block`; UT-16, UT-24 and IT-07 pass; `pnpm db:seed` now creates 6 `answer_cache` rows.
- **Depends on**: T-21, T-23, T-24

### T-27 Cost estimate and query log

- **Goal**: One `query_log` row per logged request (FR-53, D-23). The cost estimate was built in T-26.
- **Implements**: FR-53, FR-54, NFR-12; TRD §20.2
- **Files**: `lib/querylog/log.ts`, `tests/integration/querylog.test.ts`.
- **Acceptance**: Integration test asserts `question_text` is null when `STORE_QUESTIONS=false` and equals the question when `true`, and `question_hash` equals the HMAC of the normalized question.
- **Depends on**: T-08, T-23

### T-28 `POST /api/ask`

- **Goal**: The route handler with every check, the stream and logging.
- **Implements**: FR-23, FR-24, FR-25, FR-26–FR-30, FR-32, FR-53; TRD §11.2, §16.4, §18
- **Files**: `app/api/ask/route.ts`, `lib/http/errors.ts` (JSON error response helper), `lib/http/ask-request.ts` (`AskRequest` schema; route files may not export it), `tests/unit/ask-request.test.ts` (UT-18), `tests/integration/ask-route.test.ts` (IT-08), `tests/integration/pipeline-injection.test.ts` (IT-09).
- **Steps**:
  1. Implement handler order 1–12 of TRD §11.2.
  2. Heartbeat interval; abort handling; `after()` for query log and cleanup.
  3. Refund on pre-first-token failures; `refunded` flag in the `error` event.
  4. `mock:drop` handling only in mock mode.
- **Acceptance**: UT-18, IT-08, IT-09 pass. Manual: `pnpm dev:mock` and `curl -N -X POST localhost:3000/api/ask -H 'content-type: application/json' -d '{"question":"When should I use a partial index?"}'` prints `meta`, `token`, `citations`, `done` events.
- **Depends on**: T-25, T-26, T-27

### T-29 `GET /api/health`

- **Goal**: Health endpoint.
- **Implements**: FR-51; TRD §11.3
- **Files**: `app/api/health/route.ts`, `lib/http/health.ts` (`HealthResponse` schema), `tests/integration/health.test.ts` (IT-10), `playwright.config.ts` (switch web server URLs to `/api/health`).
- **Acceptance**: IT-10 passes; `curl -s localhost:3000/api/health | jq .status` prints `"ok"`.
- **Depends on**: T-28

### T-30 `useAsk` hook and state machine

- **Goal**: Client state machine and streaming fetch.
- **Implements**: FR-03, FR-04, FR-09, FR-10, FR-11; TRD §12.4, §15.4
- **Files**: `hooks/useAsk.ts` (reducer exported separately as `askReducer`), `tests/unit/use-ask-reducer.test.ts` (UT-20).
- **Acceptance**: UT-20 covers every row of the TRD §15.4 transition table.
- **Depends on**: T-24

### T-31 Ask page: form, counter, chips, status line

- **Goal**: Hero, form and suggested questions with all input states.
- **Implements**: FR-01, FR-02, FR-03, FR-04; PRD §9.2, §9.3 (empty, typing, validation, submitting)
- **Files**: `app/page.tsx`, `components/ask/AskApp.tsx`, `AskForm.tsx`, `SuggestedQuestions.tsx`, `StatusLine.tsx`, `tests/e2e/helpers/ip.ts` (`uniqueIp`, used by every E2E spec that submits a question from here on), `tests/e2e/smoke.spec.ts` (update the H1 assertion or delete the spec), `tests/e2e/ask-empty.spec.ts` (E2E-01), `ask-typing.spec.ts` (E2E-02), `ask-validation.spec.ts` (E2E-03).
- **Acceptance**: E2E-01, E2E-02, E2E-03 pass; all copy matches PRD exactly (tests assert the strings).
- **Depends on**: T-30, T-06, T-28

### T-32 Answer rendering, citation chips, sources panel, copy

- **Goal**: Safe Markdown with chips; sources panel with quote highlight and docs link; copy answer.
- **Implements**: FR-05, FR-06, FR-07, FR-11, NFR-14; TRD §15.5
- **Files**: `components/ask/AnswerView.tsx`, `CitationChip.tsx`, `SourcesPanel.tsx`, `PassageCard.tsx`, `AnswerActions.tsx`, `lib/markdown/remark-citations.ts`, `lib/copy-format.ts`, `tests/unit/remark-citations.test.ts` (UT-21), `tests/unit/copy-format.test.ts` (UT-28), `tests/e2e/ask-stream.spec.ts` (E2E-04), `ask-sources.spec.ts` (E2E-05), `ask-copy.spec.ts` (E2E-06).
- **Acceptance**: UT-21, UT-28, E2E-04–E2E-06 pass; `grep -rn dangerouslySetInnerHTML app components hooks lib | grep -v '^app/layout.tsx:'` prints nothing (the theme script is the only allowed use, D-26).
- **Depends on**: T-31

### T-33 "How this was answered" and every non-happy state

- **Goal**: Disclosure and all remaining states with exact copy.
- **Implements**: FR-08, FR-09, FR-10, FR-21, FR-26, FR-27, FR-30, FR-32; PRD §9.3
- **Files**: `components/ask/HowAnswered.tsx`, `components/ask/states/*.tsx`, `AskApp.tsx`.
- **Acceptance**: `pnpm typecheck` and UT-20 pass; for every state in PRD §9.3 the component source contains its exact H2/body strings (`grep -F` each string in `components/ask/**`; list the commands in the PR); a manual run of `pnpm dev:mock` with `mock:not-found`, `mock:provider-error`, `mock:drop` and `mock:slow` (Stop) shows each state. Automated E2E coverage follows in T-34.
- **Depends on**: T-32

### T-34 E2E suite for the ask page

- **Goal**: Every ask page state covered in mock mode.
- **Implements**: PRD §9.3; NFR-09, NFR-10
- **Files**: `tests/e2e/ask-how.spec.ts` (E2E-07), `ask-not-found.spec.ts` (E2E-08), `ask-invalid-citation.spec.ts` (E2E-09), `ask-fallback.spec.ts` (E2E-10), `ask-rate-limit.spec.ts` (E2E-11), `isolated.spec.ts` (E2E-12), `ask-readonly.spec.ts` (E2E-13), `ask-off.spec.ts` (E2E-14), `ask-provider-error.spec.ts` (E2E-15), `ask-network.spec.ts` (E2E-16), `ask-stop.spec.ts` (E2E-24), `ask-cached.spec.ts` (E2E-25), `tests/e2e/helpers/db.ts` (`ip.ts` exists since T-31).
- **Steps**:
  1. Before running, check no other Playwright run is using the same server and database.
  2. DB helper for the global counter (isolated test only, restores in `finally`); every spec uses `uniqueIp(testInfo)` from T-31.
  3. Run only the new specs while fixing; run the full suite once at the end.
- **Acceptance**: `pnpm build && pnpm test:e2e` passes all E2E specs written so far, and passes again when run a second time on the same day (rate limits reset by the global setup); CI e2e job green; total e2e job ≤ 12 minutes (PRD §11 CI duration).
- **Depends on**: T-33

---

## M3 Eval and CI

### T-35 Golden set and validator

- **Goal**: 40 questions following TRD §17.2; validator script.
- **Implements**: FR-40; TRD §17.2
- **Files**: `eval/golden.jsonl`, `lib/eval/golden.ts`, `scripts/eval-validate.ts`, `tests/unit/golden.test.ts` (UT-25), `tests/integration/eval-validate.test.ts` (IT-11).
- **Steps**:
  1. Add the 8 worked entries.
  2. Ingest with fixtures (`pnpm ingest --offline --include-fixtures`, live or mock). Run `pnpm eval:validate`; fix any example anchor that does not exist (open the raw HTML) and note it.
  3. Write q009–q040 following rules 1–8. For each answerable entry, find the anchors by reading the raw HTML, not by running the system.
  4. For each unanswerable entry, `grep -il` the key terms in `corpus/raw` to confirm absence.
- **Acceptance**: UT-25, IT-11 pass; `pnpm eval:validate` exits 0 and prints the distribution table matching rule 2.
- **Depends on**: T-14

### T-36 Eval harness

- **Goal**: `pnpm eval` computes all metrics, runs the judge, guards the budget and writes results.
- **Implements**: FR-41, FR-42, FR-44; A-02; TRD §17.1, §17.3, §17.4, §17.6, §17.7
- **Files**: `scripts/eval.ts`, `lib/eval/metrics.ts`, `lib/eval/judge.ts`, `lib/eval/budget.ts`, `lib/eval/results-schema.ts`, `lib/eval/markdown.ts`, `tests/unit/eval-metrics.test.ts` (UT-22), `tests/unit/budget.test.ts` (UT-26).
- **Steps**:
  1. Pin `JUDGE_MODEL` (A-02).
  2. Implement the flow of TRD §17.1; metrics of §17.4; output files of §17.6.
  3. First live run: `pnpm db:reset && pnpm ingest --offline --include-fixtures && pnpm eval`. Review 10 judge decisions by hand; note agreement in the PR.
- **Acceptance**: UT-22, UT-26 pass; on a database ingested with `LLM_MODE=mock pnpm ingest --offline --include-fixtures`, `LLM_MODE=mock pnpm eval --limit 3 --no-write` (pipeline smoke test; mock is accepted only with `--no-write`) runs all three questions, prints the metrics table and exits 0 or 1 (floors are evaluated but a 3-question mock run is not expected to pass them; exit 2 or 3 is a failure); a live run writes `eval/results/<date>.json` that validates against `EvalResult`.
- **Depends on**: T-35, T-28

### T-37 Thresholds, regression check and eval workflow

- **Goal**: Floors, ceilings, regression deltas; the GitHub workflow.
- **Implements**: FR-43, D-17; TRD §17.5, §25.2
- **Files**: `eval/thresholds.json`, `lib/eval/thresholds.ts`, `tests/unit/eval-thresholds.test.ts` (UT-23), `.github/workflows/eval.yml`.
- **Steps**:
  1. Implement checks per TRD §17.5.
  2. Tune retrieval or prompts until the first committed run passes all floors. Do not lower floors; if a floor cannot be met, stop and record the gap and options in the decisions log for the owner.
  3. Owner: create GitHub environment `eval` with secret and variables (TRD §25.2) and a separate OpenAI project "sourced-eval" with a budget.
  4. Commit the first passing results file as the baseline.
- **Acceptance**: UT-23 passes; `workflow_dispatch` run of `eval.yml` is green with cost below `EVAL_MAX_COST_USD`; a test PR that changes `lib/prompts/` triggers the workflow.
- **Depends on**: T-36

### T-38 `/eval` page

- **Goal**: Metric cards, trend charts, per-question table, methodology, empty state.
- **Implements**: FR-45, FR-46; PRD §9.5; TRD §15.7
- **Files**: `app/eval/page.tsx`, `lib/eval/load-results.ts`, `components/eval/EvalView.tsx`, `components/eval/MetricCard.tsx`, `TrendChart.tsx`, `ResultsTable.tsx`, `next.config.ts` (`outputFileTracingIncludes`), `tests/fixtures/eval-results/*.json` (two small runs, one with a failure), `tests/unit/eval-page-empty.test.tsx` (UT-31), `tests/e2e/eval-page.spec.ts` (E2E-21).
- **Acceptance**: UT-31 and E2E-21 pass; `pnpm build` output includes the results files in the `/eval` function trace (check `.next/server/app/eval/page.js.nft.json` lists them).
- **Depends on**: T-37, T-06

### T-39 `/how-it-works` page

- **Goal**: Pipeline explanation, diagram, limits, cost controls, privacy.
- **Implements**: FR-47, FR-48; PRD §9.6, §10.3; TRD §15.8
- **Files**: `app/how-it-works/page.tsx`, `components/how/PipelineDiagram.tsx`, `tests/e2e/how-it-works.spec.ts` (E2E-22).
- **Acceptance**: E2E-22 passes; numbers in the copy (40, 40, 60, 20, 6, 500–800, 80) are imported from `lib/config.ts`, not typed (`grep -nE '\b(40|60|20|500|800|80)\b' app/how-it-works/page.tsx components/how/PipelineDiagram.tsx` returns nothing outside Tailwind class names).
- **Depends on**: T-06

---

## M4 Polish and deploy

### T-40 Accessibility, keyboard and responsive pass

- **Goal**: Meet NFR-07, NFR-09, NFR-10.
- **Implements**: NFR-07, NFR-09, NFR-10; TRD §15.6
- **Files**: `tests/e2e/a11y.spec.ts` (E2E-17), `keyboard.spec.ts` (E2E-18), `responsive.spec.ts` (E2E-19), `theme.spec.ts` (E2E-20 complete), fixes in components.
- **Steps**:
  1. Add `@axe-core/playwright` scans for each page and state in both themes.
  2. Keyboard path and focus management fixes.
  3. 360 px layout fixes; long code lines in answers and passages scroll inside their block (`overflow-x: auto`), never the page.
  4. Lighthouse locally on `pnpm build && pnpm start` (mobile). Record scores in the PR.
- **Acceptance**: E2E-17–E2E-20 pass; Lighthouse mobile local: Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95; first-load JS for `/` ≤ 180 KB gzip measured with the command in TRD §22.
- **Depends on**: T-34, T-38, T-39

### T-41 Security review

- **Goal**: Verify NFR-14 and TRD §19.
- **Implements**: NFR-12, NFR-14; TRD §19
- **Files**: `tests/e2e/security-headers.spec.ts` (E2E-23), `eslint.config.mjs` (final `no-restricted-imports` rules from TRD §8), fixes.
- **Steps**:
  1. Check every item in TRD §19 and list it in the PR with evidence.
  2. `pnpm audit --prod` clean at `high`.
  3. Grep checks: no `console.log` in `app/`, `lib/`, `components/`, `hooks/`; no `process.env` outside `lib/env.ts`, `next.config.ts`, `drizzle.config.ts`, `playwright.config.ts`, `vitest.config.ts` and tests.
  4. Try a cross-origin POST with `curl -H 'Origin: https://evil.example'` → 403.
- **Acceptance**: E2E-23 passes; `grep -rn "process.env" app lib components hooks middleware.ts | grep -v '^lib/env.ts:'` prints nothing; `grep -rn "console\." app lib components hooks` prints nothing.
- **Depends on**: T-40

### T-42 Supabase, OpenAI project and production data

- **Goal**: Production database migrated and ingested; OpenAI project with budget; cache precomputed.
- **Implements**: D-16, D-20, D-37, FR-29, NFR-13; A-06, A-07; TRD §26.1, §26.2, §25.3
- **Files**: `.github/workflows/migrate.yml`; README "Operating" notes.
- **Steps**: TRD §26.1 steps 1–6 and §26.2 steps 1–4 (owner performs dashboard steps; the agent prepares commands and checks results). Create GitHub environment `production` with secret `MIGRATION_DATABASE_URL`. Compute worst-case monthly LLM cost per TRD §21.2 and lower `RATE_LIMIT_GLOBAL_DAILY` if needed.
- **Acceptance**: `migrate.yml` run with input `migrate` is green; `psql "$MIGRATION_DATABASE_URL" -c "select count(*) from chunks"` matches the local live ingest count; `select count(*) from answer_cache` = 6; `select count(*) from documents where is_fixture` = 0.
- **Depends on**: T-41

### T-43 Vercel deployment and DNS

- **Goal**: Live at https://sourced.firatkil.com.
- **Implements**: D-20, NFR-04, R-04; A-07, A-08, A-09; TRD §25.4, §26.3, §26.4
- **Files**: `vercel.json`; `.github/workflows/keepalive.yml` (TRD §25.4); README links.
- **Steps**: TRD §26.3 and §26.4. Verify A-08 (set `maxDuration` accordingly) and A-09 (IP header trust) on a preview deployment. After the domain works, add `keepalive.yml` exactly as TRD §25.4 and run it once with workflow dispatch.
- **Acceptance**:
  - `curl -s https://sourced.firatkil.com/api/health` → `{"status":"ok","db":"ok","llmMode":"live",...}`.
  - `curl -sI https://sourced.firatkil.com | grep -i content-security-policy` shows the nonce policy.
  - `keepalive.yml` run by workflow dispatch is green (its log shows `"db":"ok"`), and the workflow lists the schedule `17 6 */3 * *`.
  - One suggested question and one live question answered on production with verified citations; the two newest `query_log` rows (`source` `cache` and `live`) have `question_text` null.
  - Production measurements per TRD §22 recorded in the PR (≥ 30 live requests may be spread over the first week; record what is available at launch and complete later).
- **Depends on**: T-42

### T-44 README, demo GIF and diagrams

- **Goal**: The README of TRD §27.
- **Implements**: FR-57, G-1, G-4, G-5; TRD §27
- **Files**: `README.md`, `docs/assets/demo.gif`, `docs/assets/architecture.png` (optional export of the Mermaid diagram for social previews), `app/opengraph-image.tsx` and page `metadata` (FR-58, Could; skip with a decisions log entry if time is short).
- **Steps**:
  1. Write every README section in TRD §27 order.
  2. Record the GIF on production (light theme, 1200 px wide, ≤ 20 s, ≤ 4 MB; use a screen recorder and convert with `ffmpeg` + `gifski` or similar locally).
  3. Copy the metrics table from the latest `eval/results/*.md`.
  4. Fresh-clone test: on a clean directory, follow "Run locally without an API key" and time it (target ≤ 15 minutes, PRD §11).
- **Acceptance**: All TRD §27 sections present (checklist in PR); the fresh-clone run works with only the README commands; GIF ≤ 4 MB (`ls -lh docs/assets/demo.gif`).
- **Depends on**: T-43

### T-45 Release v1.0.0

- **Goal**: Final checks, tag, announcement-ready.
- **Implements**: PRD §11, §12
- **Files**: `CHANGELOG.md` (v1.0.0 entry listing features), PRD decisions log updates.
- **Steps**: Complete the release checklist below; tag `v1.0.0`; create a GitHub release with the CHANGELOG entry; set the repository description and topics (`rag`, `pgvector`, `nextjs`, `postgresql`, `llm-evaluation`, `citations`); set the repository website to the live demo.
- **Acceptance**: Every release checklist item is checked in the release PR.
- **Depends on**: T-44

---

## Traceability: functional requirements to tasks and tests

| FR | Tasks | Tests |
|---|---|---|
| FR-01 | T-31 | UT-18, E2E-02, E2E-03 |
| FR-02 | T-02, T-23, T-26, T-31 | UT-19, E2E-01, E2E-25 |
| FR-03 | T-30, T-31 | UT-20, E2E-18 |
| FR-04 | T-30, T-31 | UT-20, E2E-04 |
| FR-05 | T-32 | UT-21, E2E-05 |
| FR-06 | T-32 | E2E-05 |
| FR-07 | T-32 | UT-28, E2E-06 |
| FR-08 | T-33 | E2E-07 |
| FR-09 | T-26, T-33 | UT-09, E2E-08 |
| FR-10 | T-30, T-33 | UT-20, E2E-24 |
| FR-11 | T-30, T-32 | UT-20, E2E-04 |
| FR-12 | T-15, T-21 | UT-05, IT-01, IT-02 |
| FR-13 | T-20 | UT-06 |
| FR-14 | T-21 | pipeline.test.ts |
| FR-15 | T-19 | UT-10, UT-11 |
| FR-16 | T-19 | UT-10, IT-09 |
| FR-17 | T-18, T-26 | answer.test.ts |
| FR-18 | T-23 | UT-09 |
| FR-19 | T-22, T-26 | UT-07, E2E-10 |
| FR-20 | T-23 | UT-08, UT-09 |
| FR-21 | T-23, T-33 | UT-09, E2E-09 |
| FR-22 | T-23, T-26 | UT-09, IT-09 |
| FR-23 | T-24, T-28 | UT-12–UT-14, IT-08 |
| FR-24 | T-28 | IT-08, E2E-03 |
| FR-25 | T-28 | IT-08 (heartbeat with fake timers) |
| FR-26 | T-25, T-28 | IT-06, E2E-11 |
| FR-27 | T-25, T-28 | IT-06, E2E-12 |
| FR-28 | T-25 | UT-15 |
| FR-29 | T-26, T-28 | IT-07, IT-08, E2E-25 |
| FR-30 | T-02, T-28, T-33 | IT-08, E2E-13, E2E-14 |
| FR-31 | T-26 | UT-16 |
| FR-32 | T-25, T-28 | IT-06, IT-08, E2E-15 |
| FR-33 | T-09, T-10 | UT-29, UT-30 |
| FR-34 | T-11 | UT-02, IT-04 |
| FR-35 | T-12 | UT-01, UT-03 |
| FR-36 | T-13 | embed-batch.test.ts |
| FR-37 | T-14 | UT-04, IT-05 |
| FR-38 | T-14 | IT-04 |
| FR-39 | T-09, T-14 | IT-05 |
| FR-40 | T-35 | UT-25, IT-11 |
| FR-41 | T-36 | UT-22 |
| FR-42 | T-36 | results schema validation |
| FR-43 | T-37 | UT-23 |
| FR-44 | T-36 | UT-26 |
| FR-45 | T-38 | UT-31, E2E-21 |
| FR-46 | T-38 | E2E-21 |
| FR-47 | T-39 | E2E-22 |
| FR-48 | T-39 | E2E-22 |
| FR-49 | T-06, T-40 | E2E-20 |
| FR-50 | T-06, T-09 | E2E-01 (footer text) |
| FR-51 | T-29 | IT-10 |
| FR-52 | T-03 | logger.test.ts |
| FR-53 | T-27, T-28 | IT-08 |
| FR-54 | T-27 | querylog.test.ts, IT-08 |
| FR-55 | T-13, T-16, T-18 | UT-27, mock-provider.test.ts |
| FR-56 | T-18 | mock-provider.test.ts (interface conformance) |
| FR-57 | T-44 | README checklist |
| FR-58 | T-44 (Could) | manual |

## Release checklist

Functional
- [ ] All Must FRs implemented; any Should/Could not done has a decisions log entry.
- [ ] Every state in PRD §9.3 verified on production manually (rate-limit states may be verified locally with lowered limits; previews run `DEMO_MODE=off` against the production database).
- [ ] Copy on all pages matches PRD §9 (spot-check 20 strings).

Quality
- [ ] CI green on `main`: lint, typecheck, unit, integration, e2e, build.
- [ ] Coverage thresholds met (TRD §23.5).
- [ ] Latest committed eval run passes all floors and ceilings; README table matches it.
- [ ] Injection resistance 1.00 on the release run.

Performance and accessibility
- [ ] Lighthouse mobile on production meets NFR-07 (median of 3).
- [ ] NFR-01–NFR-05 measured on production and recorded (or scheduled with a date if traffic is insufficient at launch).
- [ ] axe: zero serious or critical issues (E2E-17).
- [ ] Manual screen-reader pass (VoiceOver on macOS): ask, stream, done announcement, chip navigation.
- [ ] 360 px check on a real phone.

Security and privacy
- [ ] CSP and headers present on production: `curl -sI https://sourced.firatkil.com` shows every header in TRD §19 items 3–4, and two requests return different nonces.
- [ ] `STORE_QUESTIONS=false` in production; `query_log.question_text` all null.
- [ ] No secrets in the repository (`git log -p | grep -E "sk-(proj-)?[A-Za-z0-9]{20,}"` prints nothing); GitHub secret scanning shows no alerts.
- [ ] Salts in production differ from preview and examples.

Cost
- [ ] OpenAI project budget and alert set; prepaid credit with auto-recharge off (or verified hard limit).
- [ ] Worst-case monthly LLM cost computed and in README; `RATE_LIMIT_GLOBAL_DAILY` set accordingly.
- [ ] Vercel and Supabase free-tier limits verified (A-07, A-08) and recorded.
- [ ] `keepalive.yml` scheduled every 3 days and green; Supabase project still active after more than 7 days with only keepalive traffic (A-07).

Operations
- [ ] Runbook (TRD §26.6) tested once: switch production to `readonly` and back.
- [ ] Rollback tested once on a preview (promote a previous deployment).
- [ ] `migrate.yml`, `eval.yml` and `keepalive.yml` have run green at least once.

Docs and release
- [ ] README complete per TRD §27; fresh-clone test done.
- [ ] Demo GIF recorded on production.
- [ ] Attribution: footer line, `corpus/LICENSE-POSTGRESQL.txt`, `NOTICE`.
- [ ] `CHANGELOG.md` v1.0.0 entry; tag `v1.0.0`; GitHub release; repository description, topics and website set.
- [ ] Link from firatkil.com added (separate repository).
