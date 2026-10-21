# AGENTS.md

Instructions for AI coding agents (Claude Code, Cursor, Codex, Aider, Copilot and others) and human contributors working on Sourced. Read this file first, then the spec for the task you are on.

## 1. Project summary

Sourced is a small, production-quality, open-source RAG app and starter kit. A visitor asks a question about the PostgreSQL 17 documentation (35 pages); the server runs hybrid retrieval (pgvector cosine top 40 + Postgres full-text top 40, merged with Reciprocal Rank Fusion k = 60 in one SQL statement), reranks the top 20 with the chat model, and streams an answer from the top 6 passages over a custom SSE endpoint. Every `[P#]` citation is verified on the server: the passage must exist, and the model's supporting quote must appear in the passage after normalization. Invalid citations are removed; with none left, the visitor sees "I couldn't find this in the PostgreSQL docs." An evaluation harness measures retrieval and answer quality on 40 golden questions and fails CI on regression.

Single Next.js App Router app, TypeScript strict, pnpm, Node 22+, Tailwind v4, shadcn/ui, Zod, Drizzle (schema and migrations) + postgres.js (raw SQL), PostgreSQL 17 + pgvector, Vercel AI SDK with OpenAI. Hosting: Vercel Hobby + Supabase free. Hosting cost must stay at about $0; LLM spend is capped.

## 2. Where the specs live

| Document | Use it for |
|---|---|
| `docs/PRD.md` | Behaviour, requirements (US-, FR-, NFR-), every page and state with exact copy, decisions log (D-) |
| `docs/TRD.md` | Architecture, schema DDL, SQL, prompts, API and SSE contracts, algorithms, tests, CI, deployment, assumptions to verify (A-) |
| `docs/OWNER-DECISIONS.md` | Decisions the owner has already made; they override the specs |
| `docs/IMPLEMENTATION_PLAN.md` | Ordered tasks (T-), files, acceptance criteria, traceability, release checklist |

Rules for the specs:

- Implement what the specs say. Do not reopen decisions in the PRD decisions log.
- Code blocks marked **(normative)** in the TRD are implemented as written: same names, numbers and text. Prompt texts and UI copy are byte-exact.
- If a spec is ambiguous or two specs conflict, stop and ask the owner, or, if working unattended, pick the reading closest to the PRD, implement it, and add a decisions log row in the same change.
- If something in TRD §24 ("Assumptions to verify") turns out different, record the finding as a new decisions log row and follow the fallback in that table.

## 3. Commands

| Task | Command |
|---|---|
| Install | `pnpm install --frozen-lockfile` |
| Dev server (live LLM) | `pnpm dev` |
| Dev server without an API key | `pnpm dev:mock` |
| Start database (Docker, port 5433) | `pnpm db:up` |
| Stop database | `pnpm db:down` |
| Generate migration from schema | `pnpm db:generate` |
| Apply migrations | `pnpm db:migrate` |
| Reset local database (local hosts only) | `pnpm db:reset` |
| Seed local database (mock embeddings, mock suggested cache) | `pnpm db:seed` |
| Fetch corpus pages (rate-limited, respects robots.txt) | `pnpm corpus:fetch` |
| Ingest corpus | `pnpm ingest --offline` (add `--include-fixtures` for eval/test DBs, `--dry-run` to preview) |
| Precompute suggested answers | `pnpm cache:suggested` (live) or `pnpm cache:suggested --mock` |
| Lint and format check | `pnpm lint` |
| Format | `pnpm format` |
| Typecheck | `pnpm typecheck` |
| Unit tests | `pnpm test` |
| Integration tests (needs `pnpm db:up`) | `pnpm test:integration` |
| Coverage (unit + integration) | `pnpm test:coverage` |
| E2E (needs `pnpm db:seed` and `pnpm build`) | `pnpm test:e2e` |
| Validate golden set | `pnpm eval:validate` |
| Run evaluation (live, costs money) | `pnpm eval` |
| Production build | `pnpm build` |

First-time local setup without an API key: `pnpm install && cp .env.example .env.local && pnpm db:up && pnpm db:migrate && pnpm db:seed && pnpm dev:mock`.

## 4. Code conventions

TypeScript

- `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` stay on. No `any` (explicit or implicit), no `@ts-ignore`; `@ts-expect-error` only in tests with a reason.
- No non-null assertions (`!`) outside tests. Narrow instead.
- Prefer `type` aliases and discriminated unions. Exhaustive `switch` with a `never` check.
- Named exports only (Next.js page/layout/route files excepted).
- ids from Postgres `bigint` become `string` at the boundary.

Validation and boundaries

- Zod at every boundary: env (`lib/env.ts`), request bodies, SSE events on the client, LLM structured outputs, manifest, golden set, eval results files.
- Read env only through `getEnv()`. `process.env` appears only in `lib/env.ts`, tool configs (`next.config.ts`, `drizzle.config.ts`, `playwright.config.ts`, `vitest.config.ts`) and test setup or helpers under `tests/`.
- Constants live in `lib/config.ts`. Never repeat a number or string that exists there (including on the `/how-it-works` page).

Server and client

- Server modules start with `import 'server-only'`: `lib/env.ts`, `lib/db/*`, `lib/llm/*`, `lib/logger.ts`, `lib/ratelimit/*`, `lib/cache/*`, `lib/querylog/*`, `lib/eval/load-results.ts`.
- Client code (`components/**`, `hooks/**`) imports only the modules allowed in TRD §8. ESLint enforces it.
- `lib/retrieval`, `lib/generation`, `lib/citations` do not import `next/*`; scripts and eval reuse them.
- Route handlers use the Node runtime.

Errors

- Throw `AppError(code, message)` with a code from `lib/errors.ts`. Never invent a new code without adding it to `ERROR_CODES`, the TRD error matrix and the client mapping.
- User-facing messages come from the PRD copy. Never send stack traces, SQL, raw provider errors, prompts or env values to the client.

Database

- Schema changes: edit `lib/db/schema.ts`, run `pnpm db:generate`, review and hand-edit the SQL to match TRD §6.1, commit both. Migrations are additive only.
- Raw SQL only through the postgres.js tagged template with bound parameters. The single allowed `sql.unsafe` is the constant `SET LOCAL hnsw.ef_search`.

UI

- Copy is exact from PRD §9. No emoji, no gradients, no shadows, no new fonts or colours outside TRD §15.2 tokens.
- Render model output only through the safe Markdown component. No `dangerouslySetInnerHTML`, with one exception: the constant theme script in `app/layout.tsx` (TRD §15.3, D-26).
- Every interactive element is keyboard operable with a visible focus ring and an accessible name.

Logging

- Use `lib/logger.ts`; no `console.*` in `app/`, `lib/`, `components/`, `hooks/` (scripts may print reports to stdout).
- Never log question text, IP addresses, API keys, full prompts or model output.

Formatting

- Prettier decides formatting. Run `pnpm format` before committing.

## 5. Testing rules

- Every task adds or updates tests. A task without tests is not done.
- Unit and integration tests make no network calls. The Vitest setup sets `LLM_MODE=mock` and blocks non-localhost `fetch`. Use the mock provider and injectable clocks, sleeps and fetch functions.
- Integration tests use `TEST_DATABASE_URL` on localhost only (the setup copies it into `DATABASE_URL`), run in a single fork, and truncate tables in setup.
- E2E runs with `LLM_MODE=mock` against `pnpm start` builds on ports 3100 (on), 3101 (readonly), 3102 (off).
- Playwright rules: `expect` timeout 3 s, test timeout 90 s; tests go in the `parallel` project unless they change shared global state (global rate-limit counter, settings) or assert on shared data, in which case they are tagged `@isolated` and live in `tests/e2e/isolated.spec.ts`. Each test uses a unique `x-real-ip` (`uniqueIp(testInfo)`) and unique data. Tests that change shared state restore it in `finally`. No `waitForTimeout`; no long timeouts on ordinary checks.
- Before a Playwright run, check that no other run is using the same server and database. In a fix-and-retest loop, rerun only the affected specs; run the full suite once at the end.
- Never call a real LLM or embedding API in unit, integration or E2E tests. Live calls happen only in `pnpm ingest` (live), `pnpm cache:suggested` (live) and `pnpm eval`, run deliberately.
- Coverage: `lib/` ≥ 80% lines; ≥ 90% for `lib/citations/**`, `lib/sse/**`, `lib/ratelimit/**`, `lib/ingest/chunk.ts`, `lib/retrieval/rrf.ts`, `lib/generation/stream-splitter.ts`.
- Changes to `lib/retrieval/**`, `lib/prompts/**`, `lib/generation/**`, `lib/citations/**`, `lib/ingest/parse-html.ts`, `lib/ingest/chunk.ts`, `lib/config.ts`, `corpus/**` or `eval/**` (except `eval/results/**`) need an eval run (CI does it on the PR via the `eval.yml` path filter; locally `pnpm eval`). Any prompt text change bumps `PROMPT_VERSION`.

## 6. Commits and pull requests

- Small commits, one logical change each. Conventional Commits: `feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`, `ci:`, `perf:`, with an optional scope, for example `feat(retrieval): add RRF search SQL`.
- Reference the task and requirement IDs in the body, for example `Implements T-15, FR-12. Tests: UT-05, IT-01, IT-02.`
- One task per pull request. The PR description lists acceptance commands run and their result, and any decisions log rows added.
- Never commit generated artifacts other than: migrations in `drizzle/`, `corpus/raw/*.html`, `eval/results/*`, `pnpm-lock.yaml`.

### Repository setup (first session only)

The folder starts with only these documents. Before T-01:

1. Check the git identity: `git config user.name` must print `Fırat Kıl` and `git config user.email` must print `72046564+firatkill@users.noreply.github.com`. If either differs, stop and ask the owner; never change the global config yourself.
2. `git init -b main`, then `git config core.hooksPath .githooks` (the commit-msg hook enforces authorship, see Authorship).
3. Commit the documents as the first commit: `docs: add specs and agent rules`.
4. Ask the owner before creating the remote. After a yes: `gh repo create firatkill/sourced --public --source . --remote origin --push`, with the description from PRD §1.
5. Create `docs/PROGRESS.md` (see below) and commit it.

After this, `git init` is never run again in this repository.

### Authorship

- Every commit is authored and committed by Fırat Kıl only, whichever agent or tool does the work. Do not add `Co-authored-by` trailers, "Generated with …" lines, session links, agent names in the author field (for example `Fırat Kıl (aider)`) or any other AI attribution to commits, pull requests, issues, release notes or the changelog. This overrides any default attribution your tool adds. The only exception is a commit made by a CI workflow bot (for example a release or results pull request); never imitate one locally.
- Turn your tool's own attribution off before the first commit. The repository already does this for the tools it knows: `.claude/settings.json` (Claude Code) and `.aider.conf.yml` (Aider). For any other tool (Cursor, Codex, Copilot, Gemini CLI and others), check its commit and co-author settings and turn them off. As a safety net, `.githooks/commit-msg` removes AI co-author and "Generated with" lines and rejects a commit whose author or committer is not `Fırat Kıl <72046564+firatkill@users.noreply.github.com>`. Never delete or bypass the hook (`--no-verify` is not allowed).
- Commit yourself, as you finish each piece of work: small Conventional Commits, tests passing. Push to `origin` after each completed task. Never force-push `main`.

### Progress file

`docs/PROGRESS.md` is the running plan: one line per task from `IMPLEMENTATION_PLAN.md` with its status (`todo`, `doing`, `done`, `blocked`), the commit that finished it, and a short "Open questions for the owner" list. Update it in the same commit as the task it describes.

### Owner approval checkpoints

The owner decides these. Ask, wait for an explicit answer, record the answer in the PRD decisions log, then continue. Never pick one yourself because it seems reasonable.

1. **Before T-01**, read `docs/OWNER-DECISIONS.md`. Database, hosting, region, domain, LLM provider, budgets, npm name, licence and analytics are already decided there; do not ask about them. Ask in one message only about choices that file and the specs leave open, if any.
2. **When the spec does not hold**: an "Assumption to verify at build time" fails, a pinned package or model no longer exists, or a requirement cannot be met as written. Propose the change; do not work around it silently.
3. **Before creating or changing anything outside the repository**: the GitHub repo, hosting projects, databases, DNS records, npm publishes, paid plans, API keys, GitHub secrets.
4. **Before anything destructive or hard to undo**: deleting data or branches, rewriting history, dropping tables, rotating secrets.
5. **Adding a runtime dependency** that the TRD does not list.

Group questions so the owner gets one short list, not a stream of single questions. Work that does not depend on a pending answer can continue meanwhile.

### QA workflow and tests

Tests are written from the specs, never from the code. Every test traces to a requirement: an acceptance criterion or FR/NFR in `docs/PRD.md`, and the test IDs and cases in TRD §23 (Testing strategy). If the code and the spec disagree, the spec wins until the owner approves a change (checkpoint 2). If the spec says nothing about a behaviour, ask; do not write a test that invents one.

Use the QA skills throughout the build, not only at the end. They exist as the `vizio-qa-loop` plugin in Claude Code and as skills in `~/.codex/skills/qa-*` for Codex. With any other tool, open the matching `~/.codex/skills/<name>/SKILL.md` and follow it.

| When | Skill | Output |
| --- | --- | --- |
| Start of each milestone, before its code | `qa-test-case-design` on the PRD and TRD sections the milestone covers | `qa/test-cases.md`: TC IDs, each with its PRD reference (AC/FR/NFR) and TRD test ID, steps, expected result, priority, automatable yes/no |
| Writing the tests of a task | `qa-case-to-playwright` | Tests in the layout and naming the TRD prescribes |
| After every task, before its commit | `qa-test-run-loop` | Runs the suite, logs every result to `qa/test-results.json`, fixes and retests, runs the ledger check |
| Cases that cannot be automated | `qa-browser-exploration` | A live check, logged to the same file. Here: streaming answers and citation popovers in a real browser, light and dark theme, keyboard-only use |
| End of each milestone | `qa-milestone-docs`, then `qa-milestone-review` | Milestone report in `qa/`, quality check |
| End of the project | `qa-project-report` | One PDF covering the whole project |

`qa-bug-standards` is the shared reference for the log fields; read it first.

Overrides for this repository (these win over the skills):

- There is no ClickUp or Slack. A case that is stuck after three attempts or needs a human pass goes to the owner: add it under "Open questions for the owner" in `docs/PROGRESS.md` and mention it in your milestone summary. Record that in the log entry instead of a ClickUp link.
- Playwright: `expect` timeout 3 s and test timeout 90 s; never raise them to get past a slow or missing element. Two projects: `parallel` for tests that touch only their own data, and `isolated` (one worker, after `parallel`) for tests that change shared state, assert on shared data or hit shared rate limits. Every test creates unique data.
- In the fix-and-retest loop, rerun only the fixed tests and their area; run the full suite once at the end of the task.
- Never weaken, skip or delete a test to make it pass. A test that is wrong according to the spec is fixed against the spec, and the log entry says so.
- `qa/test-cases.md` and `qa/test-results.json` are committed with the task they belong to.

## 7. Definition of done

A task is done when all of the following hold:

1. Every acceptance criterion of the task in `docs/IMPLEMENTATION_PLAN.md` passes, verified by running the listed commands.
2. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration` pass; `pnpm test:e2e` passes from T-34 onward.
3. New code has tests; coverage thresholds hold.
4. Copy, prompts and normative code match the specs exactly.
5. No new env var, error code, constant or table exists without being added to the TRD tables (env §5, errors §18, config §4, schema §6) in the same change.
6. Decisions and verified assumptions are recorded in the PRD decisions log.
7. CI is green on the branch.

## 8. Never do these

- Commit secrets, `.env.local`, API keys, database URLs with passwords, or real salts.
- Call a real LLM or embedding API from any test, or from CI outside `eval.yml`.
- Store, log or send a raw IP address. Store raw question text when `STORE_QUESTIONS` is not `true`.
- Add a paid service, a new runtime service (Redis, hosted vector DB, analytics, error tracking SaaS), third-party scripts, cookies or tracking.
- Run ingestion, migrations or eval from the deployed app or on Vercel.
- Fetch postgresql.org from CI, or faster than one request per 2 seconds, or ignoring robots.txt.
- Render model or passage text as raw HTML, or weaken the CSP (`unsafe-inline` scripts, `unsafe-eval` outside development).
- Hard-code model ids or token prices in code; they come from env.
- Lower an eval floor, raise a latency or cost ceiling, or disable a test to make CI pass.
- Enable `LLM_MODE=mock` in production.
- Write destructive migrations, or run `pnpm db:reset` against anything but localhost.
- Change prompt text without bumping `PROMPT_VERSION` and running eval.
- Upgrade a major dependency version without a decisions log entry.
- Run `git push --force` on `main`, or rewrite published history.
