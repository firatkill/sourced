# Progress

Updated: 2026-11-10.

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
| T-17 | M1 Ingestion and search | Real ingestion dry run against local Postgres | done | ce93307 |
| T-18 | M2 Ask, stream, citations | Chat provider (live and mock) and model pinning | done | ce93307 |
| T-19 | M2 Ask, stream, citations | Prompts, sanitization and prompt versioning | done | ce93307 |
| T-20 | M2 Ask, stream, citations | Reranker with timeout and fallback | done | ce93307 |
| T-21 | M2 Ask, stream, citations | Retrieval pipeline | done | ce93307 |
| T-22 | M2 Ask, stream, citations | Stream splitter | done | ce93307 |
| T-23 | M2 Ask, stream, citations | Citation normalizer, parser and verifier | done | ce93307 |
| T-24 | M2 Ask, stream, citations | SSE events, encoder and client parser | done | ce93307 |
| T-25 | M2 Ask, stream, citations | Rate limiter and visitor hashing | done | ce93307 |
| T-26 | M2 Ask, stream, citations | Answer orchestration, answer cache and `pnpm cache:suggested` | done | ce93307 |
| T-27 | M2 Ask, stream, citations | Cost estimate and query log | done | ce93307 |
| T-28 | M2 Ask, stream, citations | `POST /api/ask` | done | ce93307 |
| T-29 | M2 Ask, stream, citations | `GET /api/health` | done | ce93307 |
| T-30 | M2 Ask, stream, citations | `useAsk` hook and state machine | done | ce93307 |
| T-31 | M2 Ask, stream, citations | Ask page: form, counter, chips, status line | done | ce93307 |
| T-32 | M2 Ask, stream, citations | Answer rendering, citation chips, sources panel, copy | done | ce93307 |
| T-33 | M2 Ask, stream, citations | "How this was answered" and every non-happy state | done | ce93307 |
| T-34 | M2 Ask, stream, citations | E2E suite for the ask page | done | ce93307 |
| T-35 | M3 Eval and CI | Golden set and validator | done | ce93307 |
| T-36 | M3 Eval and CI | Eval harness | done | ce93307 |
| T-37 | M3 Eval and CI | Thresholds, regression check and eval workflow | done | b396f38, 398d88c, 41425df |
| T-38 | M3 Eval and CI | `/eval` page | done | ce93307 |
| T-39 | M3 Eval and CI | `/how-it-works` page | done | ce93307 |
| T-40 | M4 Polish and deploy | Accessibility, keyboard and responsive pass | doing | HEAD |
| T-41 | M4 Polish and deploy | Security review | done | 7151b26, 99c3c0d |
| T-42 | M4 Polish and deploy | Supabase, OpenAI project and production data | done | 786499f, 5cd2a5b |
| T-43 | M4 Polish and deploy | Vercel deployment and DNS | done | 190dafa, HEAD |
| T-44 | M4 Polish and deploy | README, demo GIF and diagrams | done | 560d5c4 |
| T-45 | M4 Polish and deploy | Release v1.0.0 | done | ea39e59 (tag v1.0.0) |
| T-46 | M5 Configuration seams | Migration `0003_kit` and per-document chunk uniqueness | done | ce93307 |
| T-47 | M5 Configuration seams | Kit configuration, roles and corpus schema management | done | 1bf698f |
| T-48 | M5 Configuration seams | Copy and prompts from configuration | done | 8b05a91 |
| T-49 | M5 Configuration seams | Gemini, Anthropic and Ollama providers | doing | |
| T-50 | M5 Configuration seams | Example corpus in the kit layout | todo | |
| T-51 | M5 Configuration seams | Deployment profiles | todo | |
| T-52 | M5 Configuration seams | Second fixture corpus and M5 exit | todo | |
| T-53 | M6 Sources and CLI | Source drivers and multi-host fetching | todo | |
| T-54 | M6 Sources and CLI | Generic HTML parser | todo | |
| T-55 | M6 Sources and CLI | Markdown and MDX parser | todo | |
| T-56 | M6 Sources and CLI | PDF parser | todo | |
| T-57 | M6 Sources and CLI | `.docx` parser | todo | |
| T-58 | M6 Sources and CLI | CLI framework | todo | |
| T-59 | M6 Sources and CLI | Ingest command: boilerplate, resume, dry run and confirmation | todo | |
| T-60 | M6 Sources and CLI | Contextual embedding input | todo | |
| T-61 | M6 Sources and CLI | `doctor`, `init`, `add`, `sources`, `ask`, `dev`, `deploy:check` | todo | |
| T-62 | M6 Sources and CLI | Docker path | todo | |
| T-63 | M6 Sources and CLI | Contract tests and scale check | todo | |
| T-64 | M6 Sources and CLI | Any-corpus check and M6 exit | todo | |
| T-65 | M7 Quality on any corpus | `inspect` | todo | |
| T-66 | M7 Quality on any corpus | `eval:generate`, `eval:review` and the built-in injection set | todo | |
| T-67 | M7 Quality on any corpus | Eval on kit corpora and comparison | todo | |
| T-68 | M7 Quality on any corpus | Quality check on a new corpus and M7 exit | todo | |
| T-69 | M8 Agent guidance and v2.0 | Shared skill rules and CLI reference | todo | |
| T-70 | M8 Agent guidance and v2.0 | `sourced-setup` skill | todo | |
| T-71 | M8 Agent guidance and v2.0 | `sourced-add-docs`, `sourced-ingest`, `sourced-check-quality` skills | todo | |
| T-72 | M8 Agent guidance and v2.0 | `sourced-tune`, `sourced-troubleshoot`, `sourced-deploy` skills | todo | |
| T-73 | M8 Agent guidance and v2.0 | Command pointers, permissions and skill checks in CI | todo | |
| T-74 | M8 Agent guidance and v2.0 | `private` profile access | todo | |
| T-75 | M8 Agent guidance and v2.0 | Agent files for users; contributor rules moved | todo | |
| T-76 | M8 Agent guidance and v2.0 | README, newcomer release check and v2.0.0 | todo | |

## Open questions for the owner

- Release follow-ups (D-90), due 2026-11-16: Lighthouse mobile on production (median of 3), VoiceOver pass, 360 px check on a real phone, runbook test (`DEMO_MODE=readonly` and back in Vercel, then redeploy), rollback test (promote a previous preview deployment), link from firatkil.com. The agent collects NFR-01–NFR-05 from `query_log` on 2026-11-16 and checks on 2026-11-17 that Supabase stayed active with only keepalive traffic.

- T-43 (TC-161, TC-112): production latency p95 needs at least 30 live questions from normal use over the first week; no load testing. Lighthouse on production (three runs, median) is run with TC-147. The in-app browser pane logged React error #418 on production while a clean Chromium did not; check the console once in your own Chrome.


- T-40 (TC-147): Lighthouse mobile on the local production build is not measured. It is not installed and this agent environment blocked downloading it with `npx`. Either run it yourself (Chrome DevTools → Lighthouse, mobile, on `pnpm build && pnpm start`) or allow `npx -y lighthouse@12.8.2`. NFR-07 is measured again on production in T-43.


- D-82: turn on "share inputs and outputs with OpenAI" for the sourced-eval OpenAI project only (and for the project behind your local key if you want local eval runs free). Keep it off for the production project. Without it, eval judge calls are billed at the gpt-5.4 list price (about $0.70 per full run).







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

T-33 local acceptance: "How this was answered" disclosure and every PRD §9.3 state (not found, rate limited, read-only, demo off, provider, network and server errors, stopped) with copy in lib/copy.ts, including D-81's quote-fallback line and removal reasons (approved by the owner on 2026-11-09). 22 component tests; 45 grep -F checks of the §9.3 strings pass (reviewer spot-checked 10); manual mock checks of not-found, provider error, drop and Stop. Lint, typecheck, 698 unit and 138 integration tests pass. E2E coverage of these states follows in T-34. Open item for T-40: a theme-script nonce hydration warning in the browser console (app/layout.tsx).

T-34 local acceptance: E2E-07–E2E-19, E2E-24, E2E-25 against the real mock servers (only E2E-16 stubs a network abort, as the TRD says); global-cap test isolated and restored in finally; axe zero serious/critical in 12 combinations. Found and fixed a missing visible focus outline (NFR-09). Full suite 44 passed twice the same day; reviewer removed two 10 s waits and reran: 44 passed. TC-096–TC-110 resolved. Manual VoiceOver/browser pass (TC-111) and latency measurement (TC-112) remain for M4.

M2 complete (2026-11-09): T-18–T-34 done.

T-35 local acceptance: 40-entry golden set (32 answerable, 5 unanswerable, 3 injection) with anchors read from the raw HTML and reference answers written from the passages; unanswerable entries record their grep terms (q007's only match mentions logical replication in passing). Validator checks rules 1–7, lists missing anchors and prints the distribution table. UT-25 (20) and IT-11 (4) pass; lint, typecheck, 718 unit and 142 integration tests pass; `LLM_MODE=mock pnpm eval:validate` exits 0. Reviewer spot-checked anchors and reference answers. TC-113–TC-117 resolved.

T-36 local acceptance: `pnpm eval` with metrics (TRD §17.4), judge (normative prompt, gpt-5.4, D-82), budget guard (§17.7), results schema and Markdown; judge failures count as errors (D-83). UT-22, UT-26 and 23 further unit tests pass (741 unit, 142 integration; coverage 98.25%). Mock smoke `--limit 3 --no-write` exits 1 (empty categories) and mock without `--no-write` exits 2. First live run (2026-11-09, after `db:reset` and live ingest with fixtures, $0.0020): all floors and ceilings pass — recall@5 0.97, recall@10 0.97, MRR 0.94 (without rerank 0.94 / 0.97 / 0.86), citation validity 1.00, faithfulness 1.00, false refusal 0.03 (q027), correct refusal 1.00, injection resistance 1.00, p95 6.8 s, $0.34 total at list price; results file validates against `EvalResult`. Reviewer read 10 judge decisions (q004, q005, q009, q010, q014, q016, q018, q026, q031, q033) and agrees with all 10. Rerank falls back with `empty_output` on the five unanswerable questions (reported, by design). The results file is committed with T-37 as the baseline. TC-118–TC-126 resolved.

T-37 local acceptance: `lib/eval/thresholds.ts` implements TRD §17.5 (equality at a limit passes); baseline is `--baseline` or the latest committed results file by `runId`, excluding the file being written; `eval.yml` is byte-identical to TRD §25.2. UT-23 passes; 766 unit and 142 integration tests pass; coverage 98.27%. The 2026-11-09 live run is committed as the baseline and re-checks as pass with no failures; a live two-question `--no-write` run shows it in the baseline column. `eval/results/` is excluded from Prettier because the files are generated. Remaining: the owner adds the `OPENAI_API_KEY` secret to the GitHub `eval` environment (variables already set), then a green `workflow_dispatch` run and a prompt-change PR trigger check (TC-130). TC-127–TC-129 resolved.

T-37 GitHub runs (2026-11-09): the first `workflow_dispatch` run (42613501509, cf57d3a, $0.34) passed every floor and ceiling but failed the faithfulness regression check (0.9375 vs baseline 1.00; q026 a real model error, q010 a debatable judge call) on model variance alone. The owner chose D-85: `maxRegression.faithfulness` 0.07 (41425df). The second run (42614841254, 41425df) is green: recall@5 0.97, MRR 0.94, citation validity 0.98, faithfulness 0.98, false refusal 0.03, correct refusal 1.00, injection resistance 1.00, p95 4.7 s, $0.33 total, 0 errors. PR trigger: throwaway draft PR firatkill/sourced#2 (comment-only change in `lib/prompts/sanitize.ts`) started `eval.yml` on `pull_request` (run 42615754360), which was cancelled before the eval step; the PR was closed and its branch deleted. TC-130 resolved.

T-38 local acceptance: `/eval` renders committed results without a database: nine metric cards with floors, D-84 ceilings and deltas, the without-reranking row, 160 × 40 SVG trends, the questions table with "Failures only" and keyboard row expansion (answers through the safe Markdown component), the empty state and the methodology section. Invalid result files are skipped with a warning. UT-31, the loader tests and E2E-21 pass; lint, typecheck, 771 unit and 142 integration tests, build and the full E2E suite (46) pass; `page.js.nft.json` lists `eval/results/2026-11-09.json`. Reviewer checked the page in a browser with the real 2026-11-09 run (cards, filter showing q010 and q027). TC-131–TC-135 resolved; TC-139 (light/dark, keyboard, narrow width) stays for the M4 browser pass.

T-39 local acceptance: `/how-it-works` with the PRD §9.6 copy, an ordered-list pipeline diagram (two lanes, aria-hidden SVG arrows, one column below 640 px), sections 1–8 and `#privacy`; every number comes from `lib/config.ts` and the plan's grep returns nothing. The footer and under-input links already pointed to `#privacy`. Reviewer checked the section bodies against the code (cache hits skip the quota, reset at UTC midnight) and removed one sentence in Limits that the PRD does not make. E2E-22 passes; lint, typecheck, 771 unit and 142 integration tests, build and the full E2E suite (49) pass. TC-136–TC-138 resolved.

M3 complete (2026-11-09): T-35 to T-39 done; T-37's `workflow_dispatch` run is green (D-85) and a `lib/prompts/` PR starts `eval.yml` (TC-130).

T-40 local acceptance (2026-11-09): long code and passage lines scroll inside their blocks at 360 px; 1920 px added to E2E-19; the §15.6 focus ring now applies to the shadcn Button and Textarea (their ring classes were removed); reduced motion turns off smooth scrolling and outline transitions; touch targets pass at 360 px; the theme-script nonce hydration warning is gone (`suppressHydrationWarning` on that script only, CSP unchanged). First-load JS for `/` was 192.3 KB, over the 180 KB budget; `AnswerView` and `AnswerActions` now load on demand, so the Markdown pipeline is not in the initial scripts, and the TRD §22 command prints 157.7 KB. Lint, typecheck, unit (772), integration (142), build and the full E2E suite (65) pass. TC-140–TC-146 resolved. Lighthouse (TC-147) is not measured yet; see open questions.

T-41 local acceptance (2026-11-09): E2E-23 (12 cases) checks the exact TRD §19 CSP and headers on every page and `/api/health`, a fresh nonce per request and a nonce on every script. ESLint now enforces every TRD §8 boundary row (client, API routes, framework-free libs, middleware, scripts) and a unit test checks 146 allowed and forbidden imports; no existing violation. Greps for `process.env` and `console.` print nothing; `pnpm audit --prod --audit-level high` is clean; a cross-origin POST returns 403 `ORIGIN_FORBIDDEN`. §19 evidence: (1) Zod at route, env, client SSE, golden, results, manifest, LLM outputs; (2) Markdown with `skipHtml` and an allow-list, passages as text, only the theme script uses `dangerouslySetInnerHTML`; (3)–(4) E2E-23; (5) `server-only` modules, only `NEXT_PUBLIC_SITE_URL` public, ESLint boundaries; (6) rate-limit and origin integration tests; (7) only the theme preference in `localStorage`, no cookies; (8) the only `unsafe()` is the constant `SET LOCAL hnsw.ef_search`; (9) audit clean, secret scanning and push protection on, Dependabot alerts enabled after owner approval (D-86); (10) TC-006; (11) logger redaction and TC-009. Unit 918, integration 142, E2E 77 pass. TC-148–TC-152 resolved; TC-153 resolved. The GitHub `production` environment exists for `migrate.yml` (D-86).

T-42 (2026-11-09): owner created the OpenAI project "sourced" (hard-stop budget $2 with alert, only `gpt-6-luna` and `text-embedding-3-small` allowed, data sharing off) and the Supabase project "sourced" (free, Frankfurt, Data API off); A-06 and A-07 recorded as D-87. `migrate.yml` was added (786499f); its first run failed because the secret was not a valid URL; after the owner set it again, run 42628495057 is green. Production was migrated from the local machine per TRD §26.1 step 4, then ingested live without fixtures (35 documents, 201 chunks, 98,555 embedding tokens, $0.0020) and `cache:suggested` cached the six answers ($0.0055). Production counts: 35 documents, 0 fixtures, 201 chunks (equal to the local ingest), 6 `answer_cache` rows. Worst-case cost gives `RATE_LIMIT_GLOBAL_DAILY` = 70 for production (D-88). Note for the README Operating section (T-44): `pnpm ingest` writes to `MIGRATION_DATABASE_URL` when it is set, so running it against production needs both `MIGRATION_DATABASE_URL` and `DATABASE_URL` set to the production URL; with only `DATABASE_URL` it wrote to the local database (from `.env.local`) on the first try. The local database now holds live embeddings; run `pnpm db:seed` before the next local E2E run.

T-43 (2026-11-09): owner created the Vercel project (Production and Preview variables from the agent-prepared files, `RATE_LIMIT_GLOBAL_DAILY=70`) and the domain; `sourced.firatkil.com` is a CNAME to Vercel with a valid certificate. `/api/health` on the domain and on `sourced-nine.vercel.app` returns `status ok`, `db ok`, `llmMode live`, 35 documents, 201 chunks; responses carry the nonce CSP with `upgrade-insecure-requests`, HSTS and the other §19 headers, served from `fra1`. A suggested question (cache, 9 ms server time, rendered with "Answered in advance" and sources in the browser) and two live questions (answered, 3 and 2 valid citations, 0 removed, about $0.00083 each, 7.2 s and 7.6 s total) left `query_log` rows with `question_text` null. A-08 and A-09 verified (D-89). `keepalive.yml` is byte-identical to TRD §25.4 (excluded from Prettier), lists the schedule `17 6 */3 * *` and its dispatch run 42632733771 is green with `"db":"ok"`. A clean Chromium shows no console errors on `/`, `/eval` and `/how-it-works` in both themes, with and without a stored theme; the in-app browser pane alone logs React error #418, to be checked in a real browser during the manual pass. Production measurements (TC-161, TC-112) are collected over the first week of normal use; Lighthouse on production waits like TC-147.

T-44 (2026-11-09): README follows TRD §27 in order (unit-tested), including the TRD Mermaid diagram, the eval table from `eval/results/2026-11-09.md`, the cost table with the D-88 worst case ($1.93 a month at a cap of 70) and an Operating section (production ingest needs both `MIGRATION_DATABASE_URL` and `DATABASE_URL`). Page descriptions reuse the existing lead copy; `metadataBase` comes from `NEXT_PUBLIC_SITE_URL`; `app/opengraph-image.tsx` renders a 1200 × 630 PNG with `next/og` (FR-58). The demo GIF was recorded on production with Playwright and converted with ffmpeg: light theme, 1200 px, 14.5 s, 3.6 MB. Fresh clone of 560d5c4 with only the six README commands reached a working mock ask page in 61 s (warm pnpm store). JS for `/` stays 157.7 KB. Unit 921, E2E 80 pass. TC-162–TC-165 resolved. The GIF must be recorded again after the planned redesign.

T-45 (2026-11-09): release checklist walked; automated items pass: CI green on main, coverage thresholds met (1063 unit and integration tests, 98.27% lines), latest committed eval passes every floor and the README table matches it, injection resistance 1.00 on the GitHub eval run, axe (E2E-17) clean, production CSP with a different nonce per request and every TRD §19 header, `query_log.question_text` null in all rows, no secrets in history and no secret-scanning alerts, salts unique per environment, budget and cap recorded (D-87, D-88), A-07 and A-08 recorded, `migrate.yml`, `eval.yml` and `keepalive.yml` green, README and fresh clone done, GIF on production, attribution in footer, `NOTICE` and `corpus/LICENSE-POSTGRESQL.txt`, 20 PRD §9 strings matched on production HTML, every Should/Could FR implemented. `CHANGELOG.md` v1.0.0 added. Manual and time-bound items are scheduled in D-90.

v1.1 chat redesign (2026-11-09, branch `redesign/chat-ui`, D-91): `docs/REDESIGN.md` specifies the chat layout, tokens, SQL highlighting and copy; the canvas "Sourced redesign" is the visual reference. R1: new tokens and fonts, content-page top bar, redesigned `/eval` and `/how-it-works`, in-house SQL tokenizer. R2: rail with in-tab session history and New chat, conversation with a fixed composer, verification badge, number-only citation chips, source cards, source viewer (aside, or modal sheet below 1024 px, with focus trap and quote marks) with a one-click postgresql.org link, highlighted SQL with Copy code, welcome block with topic-labelled suggestions. Spec amendments during review: the summary line uses existing SSE fields (no reranked count); the footer and both privacy links stay on `/`. Unit 1,002, integration 142, E2E 116 pass; first-load JS for `/` 162.5 KB. TC-167–TC-173 resolved. Backend, prompts and retrieval unchanged, so no eval run is needed. Merged to `main` as 39db3ee (PR #4) and deployed; production checked in the browser (cached suggested question, badge, source viewer with quote mark and postgresql.org link, no console errors). Demo GIF recorded again on production: light theme, 1200 px, 18 s, 3.1 MB. None of the six cached suggested answers contains an SQL code block, so the GIF does not show SQL highlighting, and SQL inside a source passage shows as plain prose in the viewer.