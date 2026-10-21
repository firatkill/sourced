# Progress

Updated: 2026-10-21.

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
| T-02 | M0 Setup | Configuration, environment and error codes | doing | — |
| T-03 | M0 Setup | Logging, request id and security headers | todo | — |
| T-04 | M0 Setup | Local database, Drizzle and the extensions migration | todo | — |
| T-05 | M0 Setup | Test runners and full CI | todo | — |
| T-06 | M0 Setup | Design tokens, fonts, layout shell and theme | todo | — |
| T-07 | M1 Ingestion and search | Core schema: documents and chunks | todo | — |
| T-08 | M1 Ingestion and search | Operational tables | todo | — |
| T-09 | M1 Ingestion and search | Corpus manifest, license files and injection fixture | todo | — |
| T-10 | M1 Ingestion and search | Fetcher with robots.txt and rate limiting | todo | — |
| T-11 | M1 Ingestion and search | HTML parser | todo | — |
| T-12 | M1 Ingestion and search | Tokenizer and structure-aware chunker | todo | — |
| T-13 | M1 Ingestion and search | Embedding provider (live and mock) with batching and retry | todo | — |
| T-14 | M1 Ingestion and search | Idempotent upsert, ingest runs and the ingest CLI | todo | — |
| T-15 | M1 Ingestion and search | Hybrid search SQL and reference RRF | todo | — |
| T-16 | M1 Ingestion and search | Seed script for development, CI and E2E | todo | — |
| T-17 | M1 Ingestion and search | Real ingestion dry run against local Postgres | todo | — |
| T-18 | M2 Ask, stream, citations | Chat provider (live and mock) and model pinning | todo | — |
| T-19 | M2 Ask, stream, citations | Prompts, sanitization and prompt versioning | todo | — |
| T-20 | M2 Ask, stream, citations | Reranker with timeout and fallback | todo | — |
| T-21 | M2 Ask, stream, citations | Retrieval pipeline | todo | — |
| T-22 | M2 Ask, stream, citations | Stream splitter | todo | — |
| T-23 | M2 Ask, stream, citations | Citation normalizer, parser and verifier | todo | — |
| T-24 | M2 Ask, stream, citations | SSE events, encoder and client parser | todo | — |
| T-25 | M2 Ask, stream, citations | Rate limiter and visitor hashing | todo | — |
| T-26 | M2 Ask, stream, citations | Answer orchestration, answer cache and `pnpm cache:suggested` | todo | — |
| T-27 | M2 Ask, stream, citations | Cost estimate and query log | todo | — |
| T-28 | M2 Ask, stream, citations | `POST /api/ask` | todo | — |
| T-29 | M2 Ask, stream, citations | `GET /api/health` | todo | — |
| T-30 | M2 Ask, stream, citations | `useAsk` hook and state machine | todo | — |
| T-31 | M2 Ask, stream, citations | Ask page: form, counter, chips, status line | todo | — |
| T-32 | M2 Ask, stream, citations | Answer rendering, citation chips, sources panel, copy | todo | — |
| T-33 | M2 Ask, stream, citations | "How this was answered" and every non-happy state | todo | — |
| T-34 | M2 Ask, stream, citations | E2E suite for the ask page | todo | — |
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

- Repository creation and staged bootstrap testing approved on 2026-10-21 (D-39, D-40).
- Compatible TypeScript/ESLint pins and shadcn component dependencies approved (D-44, D-45). No pending owner decisions.

## Settled overrides

- D-38 records the $2 eval-project monthly budget from OWNER-DECISIONS.md, overriding TRD §26.2's $5 recommendation. No new owner decision is needed.
- Accounts and keys are created by the owner; the owner adds the DNS record. External changes remain subject to the existing approval checkpoints.

## Verification

- Setup only: required Git identity, hook shell syntax, executable hook, initial commit authorship and absence of attribution.
- T-01 local acceptance passed: frozen install, lint, typecheck, executable scaffold checks, build and production dependency audit. CI run 39563006461 passed all three jobs.
- Vitest, integration and E2E gates begin at the stages approved in D-40.

T-02: local lint, typecheck, 15 unit tests and build pass; awaiting CI after push. Normative constants copied unchanged. Live eval is not available before the later pipeline/eval tasks.
