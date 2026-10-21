# Test cases

## M0 Setup

Source: PRD, TRD and implementation plan, read before implementation. D-40 stages runner gates. Each case applies when its task exists; later full-feature coverage is not claimed here. Preconditions: local checkout and the stated task implemented; database cases require the local Docker service, browser cases a production build.

| TC ID  | AC Reference        | TRD test ID / source           | Title                                      | Priority | Automatable | Expected result                                                                                     |
| ------ | ------------------- | ------------------------------ | ------------------------------------------ | -------- | ----------- | --------------------------------------------------------------------------------------------------- |
| TC-001 | T-01; NFR-17; D-01  | T-01 acceptance                | Pinned scaffold builds cleanly             | High     | yes         | All commands exit 0; dependencies have no ranges.                                                   |
| TC-002 | T-01; NFR-14        | TRD §3.1                       | Server modules import in scripts           | High     | yes         | All imports succeed without opening a database connection.                                          |
| TC-003 | T-01; NFR-17        | TRD §25.1                      | CI scaffold                                | High     | yes         | All three jobs pass.                                                                                |
| TC-004 | T-02; FR-55; NFR-14 | UT-17                          | Mock environment defaults                  | High     | yes         | Parsing succeeds with documented defaults.                                                          |
| TC-005 | T-02; NFR-14        | UT-17                          | Live environment validation                | Critical | yes         | Errors list missing names and never values.                                                         |
| TC-006 | T-02; FR-55         | UT-17                          | Production mock rejection                  | Critical | yes         | Configuration rejected.                                                                             |
| TC-007 | T-02; FR-54         | UT-17                          | Environment types and complete examples    | High     | yes         | All variables documented; invalid values rejected; false remains false.                             |
| TC-008 | T-02; FR-02         | UT-19                          | Suggested question definitions             | Medium   | yes         | Canonical definitions match; normalized matching completed in T-23.                                 |
| TC-009 | T-03; FR-52; NFR-12 | logger.test.ts                 | Structured logs and redaction              | Critical | yes         | JSON preserves requestId and removes sensitive values.                                              |
| TC-010 | T-03; NFR-14        | E2E-23 partial                 | Security headers and fresh nonces          | Critical | yes         | Each response has security headers, a fresh request id and a different CSP nonce.                   |
| TC-011 | T-03; NFR-14        | T-03 manual acceptance         | Browser CSP check                          | High     | no          | No CSP violations.                                                                                  |
| TC-012 | T-04; D-02          | T-04 acceptance; IT-03 partial | Local database extension and test database | High     | yes         | pgvector >=0.8.0; sourced_test connects.                                                            |
| TC-013 | T-04; NFR-14        | T-04 step 5                    | Reset refuses remote hosts                 | Critical | yes         | Refuses before any destructive operation or connection.                                             |
| TC-014 | T-05; NFR-17        | TRD §23.2; integration smoke   | Isolated integration runner                | High     | yes         | SELECT 1 succeeds on local test database; remote hosts refused.                                     |
| TC-015 | T-05; NFR-17        | TRD §23.4; E2E smoke           | Three mock web servers                     | High     | yes         | Placeholder page responds; parallel and isolated projects configured; prescribed timeouts retained. |
| TC-016 | T-05; NFR-17        | TRD §25.1                      | Six CI jobs                                | High     | yes         | Lint, typecheck, unit, integration, e2e and build green.                                            |
| TC-017 | T-06; FR-49         | E2E-20                         | System dark theme                          | Medium   | yes         | Dark tokens are effective.                                                                          |
| TC-018 | T-06; FR-49         | E2E-20                         | Theme toggle persistence                   | Medium   | yes         | Chosen theme persists.                                                                              |
| TC-019 | T-06; FR-50; NFR-09 | E2E-01 partial; PRD §9.1       | Layout landmarks and exact copy            | High     | yes         | Landmarks, labels and links match PRD §9.1.                                                         |
| TC-020 | T-06; NFR-09        | PRD §9.7; T-06 acceptance      | Not-found page                             | Medium   | yes         | Exact Page not found heading, body and link.                                                        |
| TC-021 | T-06; NFR-08        | TRD §22; T-06 acceptance       | Scaffold JavaScript budget                 | High     | yes         | Total <=120 KB at this stage.                                                                       |
| TC-022 | T-06; NFR-09        | PRD §9.1; TRD §15.6            | Keyboard layout and theme appearance       | High     | no          | Skip link works; controls operable with visible focus; specified tokens and fonts render.           |

### TC-001: Pinned scaffold builds cleanly

- Milestone: M0 Setup
- Preconditions: T-01 implemented; local environment as above.
- Requirement: T-01; NFR-17; D-01; T-01 acceptance.
- Steps: Run frozen install, lint, typecheck and build; inspect exact dependency versions.
- Expected: All commands exit 0; dependencies have no ranges.

### TC-002: Server modules import in scripts

- Milestone: M0 Setup
- Preconditions: T-01 implemented; local environment as above.
- Requirement: T-01; NFR-14; TRD §3.1.
- Steps: Import server-only, postgres, drizzle-orm and ai under tsx react-server condition.
- Expected: All imports succeed without opening a database connection.

### TC-003: CI scaffold

- Milestone: M0 Setup
- Preconditions: T-01 implemented; local environment as above.
- Requirement: T-01; NFR-17; TRD §25.1.
- Steps: Push T-01 and inspect lint, typecheck and build jobs.
- Expected: All three jobs pass.

### TC-004: Mock environment defaults

- Milestone: M0 Setup
- Preconditions: T-02 implemented; local environment as above.
- Requirement: T-02; FR-55; NFR-14; UT-17.
- Steps: Parse .env.example with LLM_MODE=mock and no API key.
- Expected: Parsing succeeds with documented defaults.

### TC-005: Live environment validation

- Milestone: M0 Setup
- Preconditions: T-02 implemented; local environment as above.
- Requirement: T-02; NFR-14; UT-17.
- Steps: Remove live-required variables and parse.
- Expected: Errors list missing names and never values.

### TC-006: Production mock rejection

- Milestone: M0 Setup
- Preconditions: T-02 implemented; local environment as above.
- Requirement: T-02; FR-55; UT-17.
- Steps: Parse mock mode with VERCEL_ENV=production.
- Expected: Configuration rejected.

### TC-007: Environment types and complete examples

- Milestone: M0 Setup
- Preconditions: T-02 implemented; local environment as above.
- Requirement: T-02; FR-54; UT-17.
- Steps: Compare TRD §5 names to example; test invalid numbers, flags and defaults.
- Expected: All variables documented; invalid values rejected; false remains false.

### TC-008: Suggested question definitions

- Milestone: M0 Setup
- Preconditions: T-02 implemented; local environment as above.
- Requirement: T-02; FR-02; UT-19.
- Steps: Compare six IDs and text with TRD §11.2.
- Expected: Canonical definitions match; normalized matching completed in T-23.

### TC-009: Structured logs and redaction

- Milestone: M0 Setup
- Preconditions: T-03 implemented; local environment as above.
- Requirement: T-03; FR-52; NFR-12; logger.test.ts.
- Steps: Capture logger output including requestId and sensitive fields.
- Expected: JSON preserves requestId and removes sensitive values.

### TC-010: Security headers and fresh nonces

- Milestone: M0 Setup
- Preconditions: T-03 implemented; local environment as above.
- Requirement: T-03; NFR-14; E2E-23 partial.
- Steps: Request built app twice with a supplied request id.
- Expected: Each response has security headers, a fresh request id and a different CSP nonce.

### TC-011: Browser CSP check

- Milestone: M0 Setup
- Preconditions: T-03 implemented; local environment as above.
- Requirement: T-03; NFR-14; T-03 manual acceptance.
- Steps: Open built app and inspect browser console.
- Expected: No CSP violations.

### TC-012: Local database extension and test database

- Milestone: M0 Setup
- Preconditions: T-04 implemented; local environment as above.
- Requirement: T-04; D-02; T-04 acceptance; IT-03 partial.
- Steps: Start Docker, migrate and query extension version and test database.
- Expected: pgvector >=0.8.0; sourced_test connects.

### TC-013: Reset refuses remote hosts

- Milestone: M0 Setup
- Preconditions: T-04 implemented; local environment as above.
- Requirement: T-04; NFR-14; T-04 step 5.
- Steps: Invoke reset safety check with a non-local URL.
- Expected: Refuses before any destructive operation or connection.

### TC-014: Isolated integration runner

- Milestone: M0 Setup
- Preconditions: T-05 implemented; local environment as above.
- Requirement: T-05; NFR-17; TRD §23.2; integration smoke.
- Steps: Run integration smoke with TEST_DATABASE_URL; inspect localhost protection.
- Expected: SELECT 1 succeeds on local test database; remote hosts refused.

### TC-015: Three mock web servers

- Milestone: M0 Setup
- Preconditions: T-05 implemented; local environment as above.
- Requirement: T-05; NFR-17; TRD §23.4; E2E smoke.
- Steps: Build and run smoke test with prescribed Playwright config.
- Expected: Placeholder page responds; parallel and isolated projects configured; prescribed timeouts retained.

### TC-016: Six CI jobs

- Milestone: M0 Setup
- Preconditions: T-05 implemented; local environment as above.
- Requirement: T-05; NFR-17; TRD §25.1.
- Steps: Push T-05 and inspect workflow.
- Expected: Lint, typecheck, unit, integration, e2e and build green.

### TC-017: System dark theme

- Milestone: M0 Setup
- Preconditions: T-06 implemented; local environment as above.
- Requirement: T-06; FR-49; E2E-20.
- Steps: Open page with dark color scheme and no saved preference.
- Expected: Dark tokens are effective.

### TC-018: Theme toggle persistence

- Milestone: M0 Setup
- Preconditions: T-06 implemented; local environment as above.
- Requirement: T-06; FR-49; E2E-20.
- Steps: Toggle theme, reload and inspect theme and accessible toggle name.
- Expected: Chosen theme persists.

### TC-019: Layout landmarks and exact copy

- Milestone: M0 Setup
- Preconditions: T-06 implemented; local environment as above.
- Requirement: T-06; FR-50; NFR-09; E2E-01 partial; PRD §9.1.
- Steps: Inspect header, navigation, skip link and all footer lines.
- Expected: Landmarks, labels and links match PRD §9.1.

### TC-020: Not-found page

- Milestone: M0 Setup
- Preconditions: T-06 implemented; local environment as above.
- Requirement: T-06; NFR-09; PRD §9.7; T-06 acceptance.
- Steps: Navigate to /does-not-exist. Render the error boundary with an internal error and activate Try again.
- Expected: Exact Page not found heading, body and link. Error boundary matches PRD §9.7 and retry calls reset without showing internal details.

### TC-021: Scaffold JavaScript budget

- Milestone: M0 Setup
- Preconditions: T-06 implemented; local environment as above.
- Requirement: T-06; NFR-08; TRD §22; T-06 acceptance.
- Steps: Sum gzip sizes of scripts referenced by built /.
- Expected: Total <=120 KB at this stage.

### TC-022: Keyboard layout and theme appearance

- Milestone: M0 Setup
- Preconditions: T-06 implemented; local environment as above.
- Requirement: T-06; NFR-09; PRD §9.1; TRD §15.6.
- Steps: Tab through layout in light and dark mode and inspect focus visibility.
- Expected: Skip link works; controls operable with visible focus; specified tokens and fonts render.

### TC-023: Firefox candidate system-dark verification

- Milestone: M0 Setup
- Requirement: FR-49; NFR-18; TRD E2E-20.
- Priority: High. Automatable: yes.
- Preconditions: Isolated compatibility candidate running in Firefox.
- Steps: Request system dark through the browser context, open the page without a stored override, inspect effective tokens and toggle label.
- Expected: Dark tokens and Switch to light theme. Explicit toggling also persists.

### TC-024: WebKit candidate keyboard navigation

- Milestone: M0 Setup
- Requirement: NFR-09; NFR-18; PRD §9.1.
- Priority: High. Automatable: yes.
- Preconditions: Isolated compatibility candidate in macOS WebKit.
- Steps: Use platform keyboard navigation including links (Option+Tab); activate Skip to content with Enter.
- Expected: Skip link is first, focus transfers to main, layout copy and links match the PRD.

## M1 Ingestion and search

Designed from PRD FR-12, FR-33–FR-39, FR-50, FR-55; TRD §§6, 9, 10, 23; T-07–T-17 before milestone implementation. Preconditions: the task implementation exists; database tests use localhost sourced_test; corpus fetching is deliberate and never part of unit/integration tests; live T-17 requires owner-controlled credentials and approved spending.

| TC ID  | AC Reference              | TRD test ID / source  | Title                               | Priority | Automatable | Expected result                                                                                                                |
| ------ | ------------------------- | --------------------- | ----------------------------------- | -------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------ |
| TC-025 | T-07; D-02; D-13          | IT-03                 | Core schema and indexes             | High     | yes         | documents, chunks and ingest_runs match TRD §6.1; HNSW cosine m=16/ef_construction=64 and GIN exist.                           |
| TC-026 | T-07; D-13                | IT-03                 | Generated full-text column          | High     | yes         | tsv is generated from content using english and updates automatically.                                                         |
| TC-027 | T-07; D-02                | IT-03                 | Core integrity constraints          | High     | yes         | Invalid rows rejected; unique document ordinals are initially deferred; document deletion cascades.                            |
| TC-028 | T-07; NFR-17              | T-07 acceptance       | Core migration reproducibility      | High     | yes         | Fresh replay succeeds and generation reports no changes.                                                                       |
| TC-029 | T-08; FR-26–FR-29; FR-53  | IT-03                 | Operational schema and constraints  | High     | yes         | DDL matches TRD §6.1 and invalid count/source/outcome/length are rejected.                                                     |
| TC-030 | T-09; FR-33               | UT-29                 | Manifest validation                 | High     | yes         | 30–40 unique pages accepted; malformed manifest rejected.                                                                      |
| TC-031 | T-09; FR-50; D-05         | A-12; A-14            | Corpus sources and attribution      | High     | yes         | Pages return 200 with expected titles; licence copied verbatim and attribution present.                                        |
| TC-032 | T-09; FR-39               | TRD §10.9             | Injection fixture content           | High     | yes         | Normative injection content and #docContent section id match exactly.                                                          |
| TC-033 | T-10; FR-33               | UT-30                 | Robots enforcement                  | High     | yes         | Disallow or unavailable policy aborts; 404 permits fetching.                                                                   |
| TC-034 | T-10; FR-33               | UT-30                 | Fetch interval and retries          | High     | yes         | Requests sequential, interval >=2 seconds or Crawl-delay; specified retry policy and headers honored.                          |
| TC-035 | T-10; FR-33; NFR-16       | UT-30                 | Offline and cached fetch            | High     | yes         | Unchanged bytes not rewritten; offline never accesses network; missing offline page fails.                                     |
| TC-036 | T-10; FR-33; NFR-16       | T-10 acceptance       | Committed corpus cache              | High     | yes         | Second run prints unchanged without refetch; raw count equals manifest count and total <=10 MB.                                |
| TC-037 | T-11; FR-34               | UT-02                 | HTML sections and blocks            | High     | yes         | Section anchors and headings retained; specified block rendering and whitespace; nav removed.                                  |
| TC-038 | T-12; FR-35               | UT-01                 | Tokenizer round trip                | High     | yes         | Known counts and exact round trip match cl100k_base.                                                                           |
| TC-039 | T-12; FR-35; NFR-16       | UT-03                 | Chunk bounds and structure          | High     | yes         | 1–800 tokens; no text lost; overlap <=80; sections preserved except tiny merge; deterministic; chunk.ts >=90% coverage.        |
| TC-040 | T-12; FR-37               | UT-04                 | Content hash formula                | High     | yes         | sha256(slug + newline + anchor + newline + content), stable and context-specific.                                              |
| TC-041 | T-12; FR-35; NFR-16       | T-11/T-12 acceptance  | Offline dry-run report              | High     | yes         | No body fallback; max <=800; identical corpus_version preview; no database writes or embedding calls.                          |
| TC-042 | T-13; FR-55               | UT-27                 | Mock feature hashing                | High     | yes         | Deterministic 1536-dimensional unit vectors; similar text closer; empty yields e0.                                             |
| TC-043 | T-13; FR-36               | embed-batch.test.ts   | Embedding batches and order         | High     | yes         | Batches <=100, concurrency <=2, order preserved, finite 1536-dimensional vectors required.                                     |
| TC-044 | T-13; FR-36               | embed-batch.test.ts   | Embedding retry policy              | High     | yes         | Specified capped jitter/backoff and Retry-After; max retries respected; 400 fails immediately.                                 |
| TC-045 | T-14; FR-34–FR-38         | IT-04                 | Ingest and report                   | High     | yes         | Counts, anchors, paths and succeeded ingest_runs match stored rows and report.                                                 |
| TC-046 | T-14; FR-37               | IT-05                 | Unchanged ingest                    | High     | yes         | Second run has zero insert/update/delete and no embedding calls.                                                               |
| TC-047 | T-14; FR-37; FR-39        | IT-05                 | Changed and removed documents       | High     | yes         | Only changed chunks embedded; removed rows deleted; fixtures excluded when false; new model re-embeds all chunks.              |
| TC-048 | T-14; FR-38               | IT-04; TRD §10.6–10.7 | Ingest failure and deployment guard | High     | yes         | Failure records failed run with message; deployed execution refused.                                                           |
| TC-049 | T-15; FR-12               | UT-05                 | Reference reciprocal rank fusion    | High     | yes         | Exact k=60 scores, best single rank then id tie-break; rrf.ts >=90% coverage.                                                  |
| TC-050 | T-15; FR-12; NFR-06       | IT-01                 | Hybrid SQL fixture                  | High     | yes         | FTS D/F/A; fused A/D/F/B/C/E; limited A/D/B/F; ef_search=100; empty FTS returns vector-only.                                   |
| TC-051 | T-15; FR-12               | IT-02                 | SQL equals reference                | High     | yes         | Same ids/order/scores; HNSW index usable with sequential scan disabled.                                                        |
| TC-052 | T-16; FR-55; G-5          | T-16 acceptance       | Mock seed                           | High     | yes         | More than 200 chunks, report matches count, sole model mock-feature-hash; CI seed succeeds.                                    |
| TC-053 | T-17; FR-36–FR-38; NFR-16 | T-17 acceptance       | Live ingest and coverage            | High     | yes         | Second run zero inserted and embedding calls; report cost/tokens/duration; global lib coverage >=80% and critical files >=90%. |

### TC-025: Core schema and indexes

- Milestone: M1 Ingestion and search
- Requirement: T-07; D-02; D-13; IT-03.
- Preconditions: milestone prerequisites above and the corresponding task implemented.
- Steps:
  1. Inspect pg_tables, pg_constraint and pg_indexes after migrations.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: documents, chunks and ingest_runs match TRD §6.1; HNSW cosine m=16/ef_construction=64 and GIN exist.

### TC-026: Generated full-text column

- Milestone: M1 Ingestion and search
- Requirement: T-07; D-13; IT-03.
- Preconditions: milestone prerequisites above and the corresponding task implemented.
- Steps:
  1. Insert a chunk, query its tsv and update content.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: tsv is generated from content using english and updates automatically.

### TC-027: Core integrity constraints

- Milestone: M1 Ingestion and search
- Requirement: T-07; D-02; IT-03.
- Preconditions: milestone prerequisites above and the corresponding task implemented.
- Steps:
  1. Attempt invalid document hash, ordinal, heading path, content, tokens and ingest status; swap chunk ordinals in a transaction.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Invalid rows rejected; unique document ordinals are initially deferred; document deletion cascades.

### TC-028: Core migration reproducibility

- Milestone: M1 Ingestion and search
- Requirement: T-07; NFR-17; T-07 acceptance.
- Preconditions: milestone prerequisites above and the corresponding task implemented.
- Steps:
  1. Reset the approved local database; run IT-03; regenerate migration.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Fresh replay succeeds and generation reports no changes.

### TC-029: Operational schema and constraints

- Milestone: M1 Ingestion and search
- Requirement: T-08; FR-26–FR-29; FR-53; IT-03.
- Preconditions: milestone prerequisites above and the corresponding task implemented.
- Steps:
  1. Inspect six tables, primary keys, indexes and checks; attempt invalid operational values.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: DDL matches TRD §6.1 and invalid count/source/outcome/length are rejected.

### TC-030: Manifest validation

- Milestone: M1 Ingestion and search
- Requirement: T-09; FR-33; UT-29.
- Preconditions: milestone prerequisites above and the corresponding task implemented.
- Steps:
  1. Parse manifest and invalid variants with duplicate slugs or invalid page counts.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: 30–40 unique pages accepted; malformed manifest rejected.

### TC-031: Corpus sources and attribution

- Milestone: M1 Ingestion and search
- Requirement: T-09; FR-50; D-05; A-12; A-14.
- Preconditions: milestone prerequisites above and the corresponding task implemented.
- Steps:
  1. Verify robots policy then request each pinned URL at least two seconds apart; compare licence and NOTICE with authoritative text.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Pages return 200 with expected titles; licence copied verbatim and attribution present.

### TC-032: Injection fixture content

- Milestone: M1 Ingestion and search
- Requirement: T-09; FR-39; TRD §10.9.
- Preconditions: milestone prerequisites above and the corresponding task implemented.
- Steps:
  1. Read fixture and assert its title, paragraphs and section structure.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Normative injection content and #docContent section id match exactly.

### TC-033: Robots enforcement

- Milestone: M1 Ingestion and search
- Requirement: T-10; FR-33; UT-30.
- Preconditions: milestone prerequisites above and the corresponding task implemented.
- Steps:
  1. Inject robots allow/disallow, 404, server error and network failure.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Disallow or unavailable policy aborts; 404 permits fetching.

### TC-034: Fetch interval and retries

- Milestone: M1 Ingestion and search
- Requirement: T-10; FR-33; UT-30.
- Preconditions: milestone prerequisites above and the corresponding task implemented.
- Steps:
  1. Use injected clock/sleep/fetch to exercise 429, 5xx, timeout, network errors and non-retryable errors.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Requests sequential, interval >=2 seconds or Crawl-delay; specified retry policy and headers honored.

### TC-035: Offline and cached fetch

- Milestone: M1 Ingestion and search
- Requirement: T-10; FR-33; NFR-16; UT-30.
- Preconditions: milestone prerequisites above and the corresponding task implemented.
- Steps:
  1. Fetch mock page twice, compare unchanged file; run offline with missing file and cached pages.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Unchanged bytes not rewritten; offline never accesses network; missing offline page fails.

### TC-036: Committed corpus cache

- Milestone: M1 Ingestion and search
- Requirement: T-10; FR-33; NFR-16; T-10 acceptance.
- Preconditions: milestone prerequisites above and the corresponding task implemented.
- Steps:
  1. Run corpus:fetch twice and inspect raw directory.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Second run prints unchanged without refetch; raw count equals manifest count and total <=10 MB.

### TC-037: HTML sections and blocks

- Milestone: M1 Ingestion and search
- Requirement: T-11; FR-34; UT-02.
- Preconditions: milestone prerequisites above and the corresponding task implemented.
- Steps:
  1. Parse three real trimmed pages and synthetic nested sections, missing ids, dl/table/note/code/nav.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Section anchors and headings retained; specified block rendering and whitespace; nav removed.

### TC-038: Tokenizer round trip

- Milestone: M1 Ingestion and search
- Requirement: T-12; FR-35; UT-01.
- Preconditions: milestone prerequisites above and the corresponding task implemented.
- Steps:
  1. Count known cl100k strings and encode/decode text.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Known counts and exact round trip match cl100k_base.

### TC-039: Chunk bounds and structure

- Milestone: M1 Ingestion and search
- Requirement: T-12; FR-35; NFR-16; UT-03.
- Preconditions: milestone prerequisites above and the corresponding task implemented.
- Steps:
  1. Chunk mixed long/short sections, long code/table lines and sentences; repeat.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: 1–800 tokens; no text lost; overlap <=80; sections preserved except tiny merge; deterministic; chunk.ts >=90% coverage.

### TC-040: Content hash formula

- Milestone: M1 Ingestion and search
- Requirement: T-12; FR-37; UT-04.
- Preconditions: milestone prerequisites above and the corresponding task implemented.
- Steps:
  1. Hash same content under different slugs and anchors; repeat same input.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: sha256(slug + newline + anchor + newline + content), stable and context-specific.

### TC-041: Offline dry-run report

- Milestone: M1 Ingestion and search
- Requirement: T-12; FR-35; NFR-16; T-11/T-12 acceptance.
- Preconditions: milestone prerequisites above and the corresponding task implemented.
- Steps:
  1. Run ingest --dry-run --offline twice over raw corpus.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: No body fallback; max <=800; identical corpus_version preview; no database writes or embedding calls.

### TC-042: Mock feature hashing

- Milestone: M1 Ingestion and search
- Requirement: T-13; FR-55; UT-27.
- Preconditions: milestone prerequisites above and the corresponding task implemented.
- Steps:
  1. Embed repeated, similar, dissimilar and empty strings.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Deterministic 1536-dimensional unit vectors; similar text closer; empty yields e0.

### TC-043: Embedding batches and order

- Milestone: M1 Ingestion and search
- Requirement: T-13; FR-36; embed-batch.test.ts.
- Preconditions: milestone prerequisites above and the corresponding task implemented.
- Steps:
  1. Inject provider across >200 inputs and inspect batch sizes, concurrency, order and token sum.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Batches <=100, concurrency <=2, order preserved, finite 1536-dimensional vectors required.

### TC-044: Embedding retry policy

- Milestone: M1 Ingestion and search
- Requirement: T-13; FR-36; embed-batch.test.ts.
- Preconditions: milestone prerequisites above and the corresponding task implemented.
- Steps:
  1. Inject 429/5xx/timeout/network and 400 errors with deterministic sleep/random.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Specified capped jitter/backoff and Retry-After; max retries respected; 400 fails immediately.

### TC-045: Ingest and report

- Milestone: M1 Ingestion and search
- Requirement: T-14; FR-34–FR-38; IT-04.
- Preconditions: milestone prerequisites above and the corresponding task implemented.
- Steps:
  1. Ingest three fixture HTML pages with mock embeddings.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Counts, anchors, paths and succeeded ingest_runs match stored rows and report.

### TC-046: Unchanged ingest

- Milestone: M1 Ingestion and search
- Requirement: T-14; FR-37; IT-05.
- Preconditions: milestone prerequisites above and the corresponding task implemented.
- Steps:
  1. Ingest same corpus twice with provider spy.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Second run has zero insert/update/delete and no embedding calls.

### TC-047: Changed and removed documents

- Milestone: M1 Ingestion and search
- Requirement: T-14; FR-37; FR-39; IT-05.
- Preconditions: milestone prerequisites above and the corresponding task implemented.
- Steps:
  1. Modify paragraph, remove page, toggle fixtures and change model id.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Only changed chunks embedded; removed rows deleted; fixtures excluded when false; new model re-embeds all chunks.

### TC-048: Ingest failure and deployment guard

- Milestone: M1 Ingestion and search
- Requirement: T-14; FR-38; IT-04; TRD §10.6–10.7.
- Preconditions: milestone prerequisites above and the corresponding task implemented.
- Steps:
  1. Inject provider failure; invoke CLI with VERCEL set.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Failure records failed run with message; deployed execution refused.

### TC-049: Reference reciprocal rank fusion

- Milestone: M1 Ingestion and search
- Requirement: T-15; FR-12; UT-05.
- Preconditions: milestone prerequisites above and the corresponding task implemented.
- Steps:
  1. Merge overlapping, disjoint and empty lists with ties and limits.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Exact k=60 scores, best single rank then id tie-break; rrf.ts >=90% coverage.

### TC-050: Hybrid SQL fixture

- Milestone: M1 Ingestion and search
- Requirement: T-15; FR-12; NFR-06; IT-01.
- Preconditions: milestone prerequisites above and the corresponding task implemented.
- Steps:
  1. Run six-chunk fixture, limited candidates, empty tsquery and SHOW hnsw.ef_search inside transaction.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: FTS D/F/A; fused A/D/F/B/C/E; limited A/D/B/F; ef_search=100; empty FTS returns vector-only.

### TC-051: SQL equals reference

- Milestone: M1 Ingestion and search
- Requirement: T-15; FR-12; IT-02.
- Preconditions: milestone prerequisites above and the corresponding task implemented.
- Steps:
  1. Compare SQL and reference over 200 deterministic random chunks and 20 questions; inspect EXPLAIN.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Same ids/order/scores; HNSW index usable with sequential scan disabled.

### TC-052: Mock seed

- Milestone: M1 Ingestion and search
- Requirement: T-16; FR-55; G-5; T-16 acceptance.
- Preconditions: milestone prerequisites above and the corresponding task implemented.
- Steps:
  1. Reset approved local DB and seed without API key; compare report with SQL.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: More than 200 chunks, report matches count, sole model mock-feature-hash; CI seed succeeds.

### TC-053: Live ingest and coverage

- Milestone: M1 Ingestion and search
- Requirement: T-17; FR-36–FR-38; NFR-16; T-17 acceptance.
- Preconditions: milestone prerequisites above and the corresponding task implemented.
- Steps:
  1. With approved credentials/budget and reset, ingest offline twice; run coverage.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Second run zero inserted and embedding calls; report cost/tokens/duration; global lib coverage >=80% and critical files >=90%.
