# Progress

Updated: 2026-11-09.

## Repository setup

- Read AGENTS.md, PRD, TRD, IMPLEMENTATION_PLAN and OWNER-DECISIONS from start to finish.
- Verified the required local Git identity for author and committer.
- Initialized `main` and enabled the existing executable `.githooks/commit-msg` hook.
- Initial documents and authorship controls committed in `0abe745` (`docs: add specs and agent rules`).
- Commits use explicit Git messages with no co-author, generated-by or session attribution. Existing Claude and Aider attribution settings remain disabled.
- GitHub repository creation and the first push approved on 2026-10-21 (D-39); created and pushed: https://github.com/firatkill/sourced.
- M0 started with spec-derived QA case design. QA case design precedes its implementation; stop for an owner review at each milestone boundary.

## Tasks

The completion commit is filled when a task finishes. In the completing commit itself, `HEAD` denotes that commit; later updates may replace it with its immutable hash.

| Task | Milestone | Description | Status | Completion commit |
| --- | --- | --- | --- | --- |
| T-01 | M0 Setup | Scaffold the repository, tooling and CI skeleton | done | 1bfb6b7 |
| T-02 | M0 Setup | Configuration, environment and error codes | done | b3e68d9 |
| T-03 | M0 Setup | Logging, request id and security headers | done | 7c0b2e6 |
| T-04 | M0 Setup | Local database, Drizzle and the extensions migration | done | 44cf3a3 |
| T-05 | M0 Setup | Test runners and full CI | done | f4cfa89 |
| T-06 | M0 Setup | Design tokens, fonts, layout shell and theme | done | 3cd3bc6 |
| T-07 | M1 Ingestion and search | Core schema: documents and chunks | done | a054711 |
| T-08 | M1 Ingestion and search | Operational tables | done | 0c6918a |
| T-09 | M1 Ingestion and search | Corpus manifest, license files and injection fixture | done | a697344 |
| T-10 | M1 Ingestion and search | Fetcher with robots.txt and rate limiting | done | f3377f1 |
| T-11 | M1 Ingestion and search | HTML parser | done | 32e96c8 |
| T-12 | M1 Ingestion and search | Tokenizer and structure-aware chunker | done | a56df5b |
| T-13 | M1 Ingestion and search | Embedding provider (live and mock) with batching and retry | done | 227ca8f |
| T-14 | M1 Ingestion and search | Idempotent upsert, ingest runs and the ingest CLI | done | 63fea80 |
| T-15 | M1 Ingestion and search | Hybrid search SQL and reference RRF | done | f443dd4 |
| T-16 | M1 Ingestion and search | Seed script for development, CI and E2E | done | 1bb38c4 |
| T-17 | M1 Ingestion and search | Real ingestion dry run against local Postgres | done | HEAD |
| T-18 | M2 Ask, stream, citations | Chat provider (live and mock) and model pinning | done | HEAD |
| T-19 | M2 Ask, stream, citations | Prompts, sanitization and prompt versioning | done | HEAD |
| T-20 | M2 Ask, stream, citations | Reranker with timeout and fallback | done | HEAD |
| T-21 | M2 Ask, stream, citations | Retrieval pipeline | done | HEAD |
| T-22 | M2 Ask, stream, citations | Stream splitter | done | HEAD |
| T-23 | M2 Ask, stream, citations | Citation normalizer, parser and verifier | done | HEAD |
| T-24 | M2 Ask, stream, citations | SSE events, encoder and client parser | done | HEAD |
| T-25 | M2 Ask, stream, citations | Rate limiter and visitor hashing | done | HEAD |
| T-26 | M2 Ask, stream, citations | Answer orchestration, answer cache and `pnpm cache:suggested` | done | HEAD |
| T-27 | M2 Ask, stream, citations | Cost estimate and query log | done | HEAD |
| T-28 | M2 Ask, stream, citations | `POST /api/ask` | done | HEAD |
| T-29 | M2 Ask, stream, citations | `GET /api/health` | done | HEAD |
| T-30 | M2 Ask, stream, citations | `useAsk` hook and state machine | done | HEAD |
| T-31 | M2 Ask, stream, citations | Ask page: form, counter, chips, status line | done | HEAD |
| T-32 | M2 Ask, stream, citations | Answer rendering, citation chips, sources panel, copy | done | HEAD |
| T-33 | M2 Ask, stream, citations | "How this was answered" and every non-happy state | done | HEAD |
| T-34 | M2 Ask, stream, citations | E2E suite for the ask page | done | HEAD |
| T-35 | M3 Eval and CI | Golden set and validator | todo | — |
| T-36 | M3 Eval and CI | Eval harness | todo | — |
| T-37 | M3 Eval and CI | Thresholds, regression check and eval workflow | todo | — |
| T-38 | M3 Eval and CI | `/eval` page | todo | — |
| T-39 | M3 Eval and CI | `/how-it-works` page | todo | — |
| T-40 | M4 Polish and deploy | Accessibility, keyboard and responsive pass | todo | — |
| T-41 | M4 Polish and deploy | Security review | todo | — |
| T-42 | M4 Polish and deploy | Supabase, OpenAI project and production data | todo | — |
| T-43 | M4 Polish and deploy | Vercel deployment and DNS | todo | — |
| T-44 | M4 Polish and deploy | README, demo GIF and diagrams | todo | — |
| T-45 | M4 Polish and deploy | Release v1.0.0 | todo | — |

## Open questions for the owner







- TC-022: light/dark appearance, font rendering and visible keyboard focus await browser/computer access and a live visual pass.
- TC-023: Firefox system-dark verification remains a manual review by owner decision D-51; Playwright media emulation did not take effect.

## Settled overrides

- D-38 records the $2 eval-project monthly budget from OWNER-DECISIONS.md, overriding TRD §26.2's $5 recommendation. No new owner decision is needed.
- Accounts and keys are created by the owner; the owner adds the DNS record. External changes remain subject to the existing approval checkpoints.

## Verification

- Setup only: required Git identity, hook shell syntax, executable hook, initial commit authorship and absence of attribution.
- T-01 local acceptance passed: frozen install, lint, typecheck, executable scaffold checks, build and production dependency audit. CI run 39563006461 passed all three jobs.
- Vitest, integration and E2E gates begin at the stages approved in D-40.

T-02: local lint, typecheck, 15 unit tests and build pass; CI run 39563649874 passed. Normative constants copied unchanged. Live eval is not available before the later pipeline/eval tasks.

T-03: 18 unit tests, lint, typecheck, build, built-server security-header checks and live Chrome CSP check passed. CI run 39564293221 passed.


T-05 local verification: lint, typecheck, 20 unit tests, integration smoke, coverage and production build plus three E2E smoke tests pass. All six CI jobs passed: run 39566914362. Coverage global enforcement begins T-17 per plan.

T-06: approved D-52 compatibility change passes the unchanged 120 KB JavaScript limit at 106.3 KB gzip. Main-repository lint, typecheck, 21 unit tests, integration smoke, production build, seven E2E tests, scaffold checks and production dependency audit pass. All six CI jobs passed in run 39573125819 for commit 3cd3bc6. Manual QA remains open; see qa/M0-review.md.

M0 boundary: T-01–T-06 implementation acceptance is complete and pushed. Stop before T-07. Full QA closure remains pending TC-022 and TC-023 manual checks.

Owner requested continuation after the M0 report. M1 started with TC-025–TC-053 spec-derived case design; M0 manual checks remain open.

T-07 local acceptance: D-53 reset approved and passed with explicit LLM_MODE=mock; four integration tests passed; no schema drift. All six CI jobs passed: run 39580104889.

T-08 local acceptance passed: normative operational migration, no schema drift, lint/typecheck, 21 unit and five integration tests. All six CI jobs passed: run 39580361843.

T-09 local acceptance: 35 URLs verified, licence copied, fixture and UT-29 pass; lint/typecheck, 23 unit and five integration tests pass. All six CI jobs passed: run 39580928795. Live eval remains unavailable until later pipeline/evaluation tasks.

T-10 local acceptance: 35 raw pages (1,192,907 bytes), second fetch run all unchanged; no network for cached reads. Lint/typecheck, 27 unit and five integration tests passed. A-13 verified in D-56. All six CI jobs passed: run 39581544503.

T-11 local acceptance: approved D-57 heading fallback; UT-02 and full 30-unit / five-integration suites pass with lint/typecheck. Audit of 35 raw pages found zero body fallbacks, nonempty titles/ids and 1,146 blocks. The CLI dry-run acceptance will be repeated in T-12 as planned. All six CI jobs passed: run 39582056212.

T-12 tokenizer is implemented and UT-01 passes. Full local lint/typecheck, 31 unit and five integration tests pass. Packing remains pending the owner decision above; no chunker implementation or acceptance claim yet.

T-12 packing correction approved as D-58; implementation and acceptance checks in progress.

T-12 local acceptance: D-58 joined-token correction implemented; UT-01/03/04, 38 unit and five integration tests, lint/typecheck pass. Chunk coverage 97.72%. Two offline previews match: 35 pages, 201 chunks, max 797 tokens, 98,555 embedding tokens; mock price zero is not live pricing verification. All six CI jobs passed: run 39584497394. Eval remains staged until M3.

T-13 local acceptance: deterministic mock and OpenAI embedding adapter, 100-input / two-worker batches, order, dimensions, usage and retry policy pass. Full lint/typecheck, 44 unit and five integration tests pass. D-59 records A-05 and installed embedding SDK verification; live calls and generation remain staged for T-17/T-18. All six CI jobs passed: run 39585046891.

T-14 implementation is ready but uncommitted: per-document transactions, unchanged-row updates, missing-only embeddings, fixture/model handling, CLI reports and failure recording. Seven focused DB tests pass, including three prescribed HTML fixtures. Full-corpus loader passed after PostgreSQL crash recovery without reset. Two local mock CLI runs pass (201 inserted, then zero inserts/updates/deletes and zero embedding inputs). Lint/typecheck passed; final unit gate is blocked by TC-013/TC-039 timeouts after three attempts. Full final integration suite and T-14 CI remain unverified.

D-60 follow-up: waited for lower load (6.84 on 10 cores, consecutive >50% CPU idle, no swap-outs). Single-worker reset guard passed, but three chunk cases still timed out. TC-013 is resolved; TC-039 remains open and retries are held for lower resource pressure. No timeout/assertion change.

Owner requested continuation; TC-039 affected retry passes all five tests in 1.12 seconds with unchanged acceptance. T-14 final gates resumed.

T-14 final local acceptance passes: lint/typecheck, 45 unit and 13 integration tests; two mock CLI runs prove idempotence. Resource-related retries resolved without changing timeouts or assertions. CI pending push.

T-14 all six CI jobs passed: run 39632532522. T-15 implementation and spec-derived tests in progress.

T-15 local acceptance: normative hybrid SQL, RRF reference and all specified fixtures pass; 47 unit / 17 integration tests, lint/typecheck pass. RRF coverage 100%. Default and forced HNSW plans on the 201-chunk corpus recorded in qa/T15-pr-description.md. CI pending push; live eval remains deferred until its harness exists.

T-15 all six CI jobs passed: run 39633348013. T-16 seed script and CI seed step implemented; lint/typecheck, 47 unit and 18 integration tests pass. Required guarded development reset remains pending owner approval.

T-16 seed implementation committed and pushed in 1bb38c4. All six CI jobs passed (39633875632), including CI seed. Only the explicitly guarded development reset-and-seed acceptance remains pending owner approval.

T-16 acceptance completed after D-61 approval: guarded local reset and mock seed passed; 201 chunks across 35 documents, sole embedding model mock-feature-hash, matching the printed report. No live API calls.

T-17 preparation: global lib line coverage floor enabled at 80%; existing critical chunk/RRF floors remain 90%. Coverage passed: 96.35% overall lines, chunk 97.72%, RRF 100%. Live validation is blocked on owner configuration and reset/live-call approval; no API calls or T-17 reset performed. Pricing source: https://developers.openai.com/api/docs/models/text-embedding-3-small ($0.02 per million input tokens, checked 2026-10-21).

T-17 follow-up (2026-10-23): D-62 approval recorded. Local API key and chat model remain absent; all three required prices are zero/unset. No reset or live API calls performed. Preparation commit 50537f0 passed all CI checks in run 39660248863. Live validation remains blocked solely on local credential availability; model/prices will be verified before execution.

T-17 local acceptance (2026-11-09, D-62): live offline ingest of 35 documents, 201 chunks, 98,555 embedding tokens, est. $0.0020, 5.5 s; second run 0 inserted/updated/deleted and 0 embedding inputs; 201 chunks, sole model text-embedding-3-small. Temporary CHAT_MODEL `gpt-6-luna` ($0.10 / $0.50 per 1M) set only in `.env.local`; T-18 pins the real model. Embedding price $0.02 per 1M confirmed from https://developers.openai.com/api/docs/models/text-embedding-3-small on 2026-11-09. Lint, typecheck, 47 unit and 18 integration tests and coverage (96.35% lines; chunk 97.72%, RRF 100%) pass. M1 complete.

Orchestration (2026-11-09): from M2 on, Codex implements each task from a prompt in the git-ignored `.codex-prompts/`; the reviewer (Claude Code) checks the diff against the specs, re-runs the checks, commits and updates this file.

T-18 local acceptance: OpenAI streamText/generateObject (AI SDK 7 `streamText`, `generateText` + `Output.object`) with maxRetries 0, explicit non-strict schema (D-73), conditional temperature, exact TRD §18 messages; every mock script of TRD §23.3. Pinned gpt-6-luna (D-74). Scratch live call streamed text with usage. Lint, typecheck, 85 unit and 18 integration tests, coverage 97.16% lines pass. TC-054–TC-057 resolved. Review round found three deviations, fixed by Codex in the same session.

T-19 local acceptance: six prompt modules per TRD §13 with values imported from lib/config.ts; sanitization follows D-75 (control characters removed first). UT-10 and UT-11 pass (330 cases); system prompt byte-identical to TRD §13.1, independently re-checked by the reviewer; PROMPT_VERSION 2026-10-v1. Lint, typecheck, 415 unit and 18 integration tests pass. TC-058 and TC-059 resolved; TC-060's token-cap half moves to T-26. ESLint now ignores the local `.codex-prompts/` folder.

T-20 local acceptance: listwise rerank per TRD §9.4 with RERANK_TIMEOUT_MS, client abort rethrown, fallback reasons timeout / error / invalid_output / empty_output. Provider errors now keep their original error as `cause` (never logged or sent) so `isInvalidOutput` can classify schema failures, as TRD §13.0 requires. UT-06 (21 cases) passes; lint, typecheck, 440 unit and 18 integration tests pass; reranker 100% lines. TC-061 resolved. The eval gate for `lib/retrieval/**` changes applies once the harness exists (T-36/T-37).

T-21 local acceptance: embedQuery (QUERY_TIMEOUT_MS, one retry after 300 ms on network/5xx/429) and retrieve (embed → search → rerank → P1..Pn with officialUrl and timings). Integration test with the HTML fixtures passes; lint, typecheck, 440 unit and 30 integration tests pass; pipeline 100% lines. TC-062 and TC-063 resolved. Reviewer moved the 'Search failed.' message into lib/errors.ts. The §9.5 snippet is produced where the meta event is built (T-26).

T-22 local acceptance: normative stream splitter (TRD §14.1) with UT-07 over every split position; 100% lines; per-file 90% coverage floor added. Lint, typecheck, unit, integration and coverage (479 tests) pass. TC-064 resolved. The §14.1 trailing-JSON rule is applied in answer orchestration (T-26).

T-23 local acceptance: normalizer (TRD §14.2 normative), code-aware marker parsing, block parsing and verification per §14.3, matchSuggested. UT-08, UT-09, UT-19 pass; lib/citations 100% lines with a 90% floor added. Lint, typecheck, 526 tests with coverage pass. TC-065–TC-067 resolved.

T-24 local acceptance: normative SSE event schemas (§12.2) and client parser (§12.4), encoder and heartbeat bytes (§12.3), plus a startHeartbeat helper the route will use. UT-12–UT-14 pass (103 cases); lib/sse 100% lines with a 90% floor added. Lint, typecheck, 629 tests with coverage pass. TC-068 and TC-069 resolved; TC-070's route-level check moves to T-28.

T-25 local acceptance: normative limiter SQL (TRD §16.1) and visitor hashing (§16.2). UT-15 and IT-06 pass, including 50 concurrent requests with limit 10 → exactly 10 successes; lib/ratelimit 100% lines with a 90% floor added. Lint, typecheck, 644 tests with coverage pass. TC-071–TC-073 resolved; the per-request refund guard and the §16.1 cleanup are wired in T-28.

T-26 local acceptance: answerQuestion per TRD §14.4 (first-token watchdog, total timeout, splitter, §14.1 JSON tail, verification with quote fallback), cost estimate (§21.1), answer cache with versioned keys and replay (§16.3), `pnpm cache:suggested [--mock]`, seed creates 6 mock cache rows. Review: meta candidate counts fixed per D-76; internal error message centralized. Lint, typecheck, 611 unit and 63 integration tests pass. TC-060 and TC-074–TC-078 resolved. Local database now holds the mock-seeded corpus (re-ingest live with `pnpm ingest --offline` when needed).

T-27 local acceptance: logQuery per TRD §20.2 with Zod-validated input, salted question hash, question text only with STORE_QUESTIONS=true, no IP. Lint, typecheck, 611 unit and 75 integration tests pass; query logger 100% lines. TC-079 resolved; TC-080 (which requests write a row) is verified with the route in T-28.

T-28 local acceptance: POST /api/ask in the normative handler order (TRD §11.2): content type, body size, validation details, origin check, demo modes, suggested-id resolution, cache replay, quotas with Retry-After, SSE stream with validated send, heartbeat, single abort controller, refund at most once before the first token, query log and §16.1 cleanup in after(). logQuery now uses bound postgres.js SQL (Drizzle's insert path altered the shared client's codecs). UT-18, IT-08, IT-09 pass; lint, typecheck, 632 unit and 132 integration tests and the production build pass; manual curl stream checked. TC-070 and TC-080–TC-085 resolved.

T-29 local acceptance: GET /api/health per TRD §11.3 (SELECT 1, counts, corpus version, 3 s timeout, no LLM call); IT-10 passes; curl prints "ok"; Playwright readiness URLs point to /api/health. Lint, typecheck and 138 integration tests pass. TC-086 resolved.

T-30 local acceptance: useAsk with exported askReducer per TRD §15.4 and D-77 (token after the 600 ms timer returns to streaming; notFound awaiting done is in-flight), frame-batched text updates, SSE transport through the shared parser, HTTP error mapping (D-33, D-78), Stop via AbortController. UT-20: 34 tests, one per transition row. Lint, typecheck, 666 unit tests pass; client imports pass the ESLint boundary rules. TC-087 resolved.

T-31 local acceptance: ask page form, counter, suggested chips and status line with corpus copy centralized in lib/copy.ts (FR-74). E2E-01–E2E-03 pass; full E2E suite 11 passed; build passes. Reviewer checked the empty and validation states in a browser. TC-088–TC-090 resolved.

T-32 local acceptance: answer view with safe Markdown and citation chips (remark plugin, D-79 adds @types/mdast), sources panel with highlighted quotes and official links, copy answer. UT-21, UT-28 pass; E2E-04–E2E-06 run against the real mock server (an earlier version stubbed the API in the page and was rewritten); full E2E suite 16 passed; no raw HTML outside app/layout.tsx. 'Checking citations' phase covered by UT-20 (D-80). Reviewer relinked node_modules to the default pnpm store after a store was created inside .git. TC-091–TC-095 resolved.

T-33 local acceptance: "How this was answered" disclosure and every PRD §9.3 state (not found, rate limited, read-only, demo off, provider, network and server errors, stopped) with copy in lib/copy.ts, including D-81's proposed quote-fallback line and removal reasons (owner confirmation pending). 22 component tests; 45 grep -F checks of the §9.3 strings pass (reviewer spot-checked 10); manual mock checks of not-found, provider error, drop and Stop. Lint, typecheck, 698 unit and 138 integration tests pass. E2E coverage of these states follows in T-34. Open item for T-40: a theme-script nonce hydration warning in the browser console (app/layout.tsx).

T-34 local acceptance: E2E-07–E2E-19, E2E-24, E2E-25 against the real mock servers (only E2E-16 stubs a network abort, as the TRD says); global-cap test isolated and restored in finally; axe zero serious/critical in 12 combinations. Found and fixed a missing visible focus outline (NFR-09). Full suite 44 passed twice the same day; reviewer removed two 10 s waits and reran: 44 passed. TC-096–TC-110 resolved. Manual VoiceOver/browser pass (TC-111) and latency measurement (TC-112) remain for M4.

M2 complete (2026-11-09): T-18–T-34 done.
