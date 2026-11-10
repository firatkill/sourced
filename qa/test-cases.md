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

## M2 Ask, stream, citations

Source: PRD §7.1–7.6, §9.2–9.4, FR-51–FR-56, NFR-01–NFR-05, NFR-09, NFR-10, NFR-12, NFR-14, NFR-15; TRD §9.4–§16, §18, §20–§23; implementation plan T-18–T-34. Designed from the specs before implementation. Live-model cases are marked; everything else runs with `LLM_MODE=mock`. Gaps found while designing: none that block cases; NFR-01–NFR-03 production measurement belongs to M4.

| TC ID  | AC Reference                    | TRD test ID / source             | Title                                             | Priority | Automatable | Expected result                                                                                                                                                                                                                |
| ------ | ------------------------------- | -------------------------------- | ------------------------------------------------- | -------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TC-054 | T-18; FR-55; FR-56              | TRD §23.3; mock-provider.test.ts | Mock provider scripts                             | Critical | yes         | Every mock trigger in TRD §23.3 produces its scripted stream, structured output, usage and errors deterministically.                                                                                                           |
| TC-055 | T-18; A-01; A-03; A-04          | T-18 acceptance                  | Chat model pinned with prices                     | High     | yes         | `.env.example` has the pinned CHAT_MODEL and JUDGE_MODEL with `# Pinned on <date> from <url>`, prices commented; decisions log rows exist.                                                                                     |
| TC-056 | T-18; A-03; D-19                | T-18 manual acceptance           | Live streaming call with the pinned model         | High     | no          | A scratch live call streams text and returns usage; temperature support recorded as MODEL_SUPPORTS_TEMPERATURE.                                                                                                                |
| TC-057 | T-18; NFR-15                    | TRD §13.0                        | OpenAI adapter error mapping                      | High     | yes         | Stream errors and aborts surface as AppError PROVIDER_ERROR / PROVIDER_TIMEOUT from the text iterator; maxRetries 0; missing usage maps to 0.                                                                                  |
| TC-058 | T-19; FR-15                     | UT-11                            | System prompt byte-identical and versioned        | Critical | yes         | System prompt equals TRD §13.1 byte for byte; prompt hash snapshot matches PROMPT_VERSION.                                                                                                                                     |
| TC-059 | T-19; FR-16                     | UT-10                            | Delimiter sanitization                            | Critical | yes         | Delimiter sequences in question or passage text cannot create extra delimiters; template shape exact; zero passages handled.                                                                                                   |
| TC-060 | T-19; FR-17                     | TRD §13.1.1                      | Output limits in prompt and call                  | Medium   | yes         | Prompt asks for under 250 words; generation passes MAX_OUTPUT_TOKENS (default 700).                                                                                                                                            |
| TC-061 | T-20; FR-13                     | UT-06                            | Reranker ranking and fallback                     | Critical | yes         | Valid ranking applied; unknown and duplicate ids dropped; empty, invalid or error output and 4,000 ms timeout fall back to RRF order with rerankFallback true and a reason; ≤ 6 candidates skips the call.                     |
| TC-062 | T-21; FR-12–FR-14               | T-21 integration acceptance      | Retrieval pipeline end to end (mock)              | Critical | yes         | ≤ 6 passages labelled P1..Pn; officialUrl includes the section fragment; timings present; rerankFallback false in mock.                                                                                                        |
| TC-063 | T-21; FR-12                     | TRD §9.1                         | Zero retrieval results                            | High     | yes         | An empty result set yields zero passages and leads to the not-found path, not an error.                                                                                                                                        |
| TC-064 | T-22; FR-19                     | UT-07                            | Stream splitter at every boundary                 | Critical | yes         | The delimiter is never streamed for any split position; text before it is streamed in order; block after it captured; partial prefixes flushed; coverage ≥ 90%.                                                                |
| TC-065 | T-23; FR-20; D-22               | UT-08                            | Quote normalization                               | High     | yes         | NFKC, lowercase, punctuation/symbols to spaces, whitespace collapse; offsets map back to original substrings.                                                                                                                  |
| TC-066 | T-23; FR-18–FR-22               | UT-09                            | Citation parsing and verification                 | Critical | yes         | Markers parsed (grouped, case, ignored in code); out-of-range, missing-quote, short-quote (< 4 words) and not-in-passage citations invalid with reasons; invalid markers removed with correct spacing; zero valid → not found. |
| TC-067 | T-23; FR-02                     | UT-19                            | Suggested question matching                       | Medium   | yes         | matchSuggested normalizes case, whitespace and punctuation and returns the suggested id only for the six questions.                                                                                                            |
| TC-068 | T-24; FR-23                     | UT-12; UT-13                     | SSE encoding and event schemas                    | Critical | yes         | Each event encodes as one data line with the right event name; heartbeat bytes exact; Zod schemas accept the TRD examples and reject malformed payloads.                                                                       |
| TC-069 | T-24; FR-23                     | UT-14                            | Client SSE parser robustness                      | Critical | yes         | Byte-by-byte replay, CRLF/CR, comments, multi-line data and missing final blank line with end() yield the same events.                                                                                                         |
| TC-070 | T-24; FR-25                     | TRD §12                          | Heartbeat while open                              | Medium   | yes         | `: ping` comment is sent every 15 s while the stream is open and stops at close.                                                                                                                                               |
| TC-071 | T-25; FR-28; D-10               | UT-15                            | Visitor hash privacy                              | Critical | yes         | Header precedence and IPv6 handled; HMAC changes with date and salt; raw IP never in output or logs.                                                                                                                           |
| TC-072 | T-25; FR-26; FR-27              | IT-06                            | Per-visitor and global quotas                     | Critical | yes         | Nth request allowed, (N+1)th rejected with scope; IP rejection does not increment global; 50 concurrent with limit 10 → exactly 10 succeed; date rollover resets.                                                              |
| TC-073 | T-25; FR-32; D-11               | IT-06                            | Quota refund before first token                   | High     | yes         | A provider failure before the first token refunds both counters exactly once.                                                                                                                                                  |
| TC-074 | T-26; FR-09; FR-22              | answer.test.ts                   | Answer orchestration event order                  | Critical | yes         | Default: meta → token+ → citations → done; mock:not-found → not-found; mock:invalid-citation removes exactly 2; mock:no-block uses the quote fallback.                                                                         |
| TC-075 | T-26; FR-29                     | IT-07                            | Answer cache keys and staleness                   | High     | yes         | Write and current lookup; stale entries served only in readonly; key includes corpus, prompt and model versions.                                                                                                               |
| TC-076 | T-26; FR-29                     | T-26 acceptance                  | Seed creates suggested cache                      | High     | yes         | `pnpm db:seed` creates 6 answer_cache rows.                                                                                                                                                                                    |
| TC-077 | T-26; FR-31                     | UT-16                            | Per-question cost estimate                        | High     | yes         | Formula uses env prices; zero fallback tokens; reasoning tokens added to output.                                                                                                                                               |
| TC-078 | T-26                            | UT-24                            | Server modules import from scripts                | Medium   | yes         | tsx with react-server condition imports db client, env and answer modules without opening a connection.                                                                                                                        |
| TC-079 | T-27; FR-53; FR-54; NFR-12      | T-27 integration acceptance      | Query log privacy                                 | Critical | yes         | question_text null when STORE_QUESTIONS=false and equal to the question when true; question_hash equals HMAC of the normalized question; no raw IP.                                                                            |
| TC-080 | T-27; D-23                      | TRD §20.2                        | Which requests write a query_log row              | High     | yes         | Cache hits, rate-limited and live requests write one row; validation, origin, content-type, size, DEMO_OFF and DEMO_READONLY rejections write none.                                                                            |
| TC-081 | T-28; FR-01; FR-24              | UT-18                            | Ask request validation                            | High     | yes         | Trim and whitespace collapse; < 3 and > 500 rejected; unknown fields rejected; suggested id accepted.                                                                                                                          |
| TC-082 | T-28; FR-23; FR-24              | IT-08                            | Ask route statuses and stream                     | Critical | yes         | Valid request streams schema-valid events in order; each JSON error returns its status (400, 403, 413, 415, 429, 503) with the error envelope; cache hit replays without quota use.                                            |
| TC-083 | T-28; FR-16; FR-22              | IT-09                            | Passage-borne injection does not reach the answer | Critical | yes         | With the injection fixture ingested, forbidden strings never appear in a verified answer.                                                                                                                                      |
| TC-084 | T-28; FR-30; D-12               | IT-08                            | Demo modes in the route                           | High     | yes         | readonly serves only cached suggested answers and returns 503 DEMO_READONLY otherwise; off returns 503 DEMO_OFF for all.                                                                                                       |
| TC-085 | T-28                            | T-28 manual acceptance           | curl stream in dev:mock                           | Medium   | no          | curl -N prints meta, token, citations, done events.                                                                                                                                                                            |
| TC-086 | T-29; FR-51                     | IT-10                            | Health endpoint                                   | High     | yes         | 200 with counts when DB is up; 503 when the DB URL points to a closed port.                                                                                                                                                    |
| TC-087 | T-30; FR-03; FR-04; FR-09–FR-11 | UT-20                            | useAsk reducer transitions                        | Critical | yes         | Every row of TRD §15.4 transition table holds.                                                                                                                                                                                 |
| TC-088 | T-31; FR-02; FR-50              | E2E-01                           | Empty state copy                                  | High     | yes         | H1, lead, label, counter 0 / 500, six chips and three footer lines match PRD §9.                                                                                                                                               |
| TC-089 | T-31; FR-01                     | E2E-02                           | Typing counter                                    | Medium   | yes         | Counter updates; warning colour at 450; maxLength blocks the 501st character.                                                                                                                                                  |
| TC-090 | T-31; FR-01                     | E2E-03                           | Validation messages                               | High     | yes         | Empty and 2-character submits show exact copy with aria-invalid; server 400 for 600 characters is mapped.                                                                                                                      |
| TC-091 | T-32; FR-04; FR-11              | E2E-04                           | Streaming answer and ask-again                    | Critical | yes         | Status phases appear; text streams; chips become buttons; done announcement; ask another question keeps the text selected and focused.                                                                                         |
| TC-092 | T-32; FR-05; FR-06              | E2E-05                           | Sources panel and chip navigation                 | High     | yes         | Chip click focuses card; mark contains quote; link href equals officialUrl with target and rel; uncited badge shown.                                                                                                           |
| TC-093 | T-32; FR-07                     | E2E-06; UT-28                    | Copy answer                                       | Medium   | yes         | Clipboard text matches FR-07 format; label shows Copied for 2 s.                                                                                                                                                               |
| TC-094 | T-32; FR-05                     | UT-21                            | Citation chips from text only                     | High     | yes         | Chips created from text markers, never inside code; labels P1–P6 only.                                                                                                                                                         |
| TC-095 | T-32; NFR-14; D-26              | T-32 acceptance                  | No raw HTML rendering                             | Critical | yes         | dangerouslySetInnerHTML appears only in app/layout.tsx.                                                                                                                                                                        |
| TC-096 | T-33; FR-08                     | E2E-07                           | How this was answered                             | High     | yes         | Table columns, rerank line, timings, tokens and cost shown as PRD §9.2.                                                                                                                                                        |
| TC-097 | T-33; FR-09                     | E2E-08                           | Not-found state                                   | Critical | yes         | Exact heading and body; related reading cards; no unverified draft text.                                                                                                                                                       |
| TC-098 | T-33; FR-21                     | E2E-09                           | Removed citations note                            | High     | yes         | Invalid markers absent; note reads 2 citations were removed…                                                                                                                                                                   |
| TC-099 | T-33; FR-19                     | E2E-10                           | Quote fallback                                    | Medium   | yes         | Answer completes with valid chips; disclosure shows fallback used.                                                                                                                                                             |
| TC-100 | T-33; FR-26                     | E2E-11                           | Visitor rate limit state                          | High     | yes         | 4th live question shows visitor copy with reset time; suggested chip still answers.                                                                                                                                            |
| TC-101 | T-33; FR-27                     | E2E-12 @isolated                 | Global rate limit state                           | High     | yes         | Global copy shown; global row restored in finally.                                                                                                                                                                             |
| TC-102 | T-33; FR-30                     | E2E-13; E2E-14                   | Read-only and off modes                           | High     | yes         | 3101: banner, disabled input, chip answers with Answered in advance. 3102: demo-off copy and links.                                                                                                                            |
| TC-103 | T-33; FR-32                     | E2E-15                           | Provider error states                             | High     | yes         | mock:provider-error copy includes not counted; Try again resubmits; mock:error-midstream copy omits it.                                                                                                                        |
| TC-104 | T-33                            | E2E-16                           | Network error state                               | High     | yes         | Connection lost with partial answer label for mock:drop and for an aborted request.                                                                                                                                            |
| TC-105 | T-33; FR-10                     | E2E-24                           | Stop                                              | Medium   | yes         | Stop shows the stopped label and partial text.                                                                                                                                                                                 |
| TC-106 | T-33; FR-29                     | E2E-25                           | Cached suggested answer                           | High     | yes         | Chip shows Answered in advance and cached disclosure line; visitor quota unchanged.                                                                                                                                            |
| TC-107 | T-34; NFR-09                    | E2E-17                           | Accessibility scan                                | Critical | yes         | Zero serious or critical axe violations in each state and theme.                                                                                                                                                               |
| TC-108 | T-34; NFR-09; FR-03; FR-10      | E2E-18                           | Keyboard operation                                | High     | yes         | Skip link, tab order, Enter/Shift+Enter, chips, disclosure and Stop work by keyboard.                                                                                                                                          |
| TC-109 | T-34; NFR-10                    | E2E-19                           | Responsive layout                                 | High     | yes         | No horizontal scroll at 360 and 1024 px; sources below answer at 360.                                                                                                                                                          |
| TC-110 | T-34                            | T-34 acceptance                  | E2E suite repeatable and within CI budget         | High     | yes         | Full suite passes twice on the same day; CI e2e job green and ≤ 12 minutes.                                                                                                                                                    |
| TC-111 | T-34; NFR-09                    | T-34 manual                      | Streaming and citations in a real browser         | High     | no          | Streaming text, chip activation, focus moves and live-region announcements behave as specified with VoiceOver; light and dark themes.                                                                                          |
| TC-112 | NFR-01–NFR-03                   | TRD §22                          | Latency budgets (warm, live)                      | Medium   | no          | Measured p95 meta ≤ 2,000 ms, first token ≤ 3,500 ms, done ≤ 12,000 ms; recorded, measured on production in M4.                                                                                                                |

### TC-054: Mock provider scripts

- Milestone: M2 Ask, stream, citations
- Requirement: T-18; FR-55; FR-56; TRD §23.3; mock-provider.test.ts.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Call the mock provider with each trigger in the TRD §23.3 table and the default question.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Every mock trigger in TRD §23.3 produces its scripted stream, structured output, usage and errors deterministically.

### TC-055: Chat model pinned with prices

- Milestone: M2 Ask, stream, citations
- Requirement: T-18; A-01; A-03; A-04; T-18 acceptance.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Inspect `.env.example` and the PRD decisions log.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: `.env.example` has the pinned CHAT_MODEL and JUDGE_MODEL with `# Pinned on <date> from <url>`, prices commented; decisions log rows exist.

### TC-056: Live streaming call with the pinned model

- Milestone: M2 Ask, stream, citations
- Requirement: T-18; A-03; D-19; T-18 manual acceptance.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Run the uncommitted scratch script once with the owner's key.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: A scratch live call streams text and returns usage; temperature support recorded as MODEL_SUPPORTS_TEMPERATURE.

### TC-057: OpenAI adapter error mapping

- Milestone: M2 Ask, stream, citations
- Requirement: T-18; NFR-15; TRD §13.0.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Unit-test the adapter with a mocked transport emitting an error part, an abort and missing usage.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Stream errors and aborts surface as AppError PROVIDER_ERROR / PROVIDER_TIMEOUT from the text iterator; maxRetries 0; missing usage maps to 0.

### TC-058: System prompt byte-identical and versioned

- Milestone: M2 Ask, stream, citations
- Requirement: T-19; FR-15; UT-11.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Compare the exported prompt with the stored TRD copy; compute the hash.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: System prompt equals TRD §13.1 byte for byte; prompt hash snapshot matches PROMPT_VERSION.

### TC-059: Delimiter sanitization

- Milestone: M2 Ask, stream, citations
- Requirement: T-19; FR-16; UT-10.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Build prompts with injected delimiter strings and with no passages.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Delimiter sequences in question or passage text cannot create extra delimiters; template shape exact; zero passages handled.

### TC-060: Output limits in prompt and call

- Milestone: M2 Ask, stream, citations
- Requirement: T-19; FR-17; TRD §13.1.1.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Inspect built prompt and the arguments passed to streamText.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Prompt asks for under 250 words; generation passes MAX_OUTPUT_TOKENS (default 700).

### TC-061: Reranker ranking and fallback

- Milestone: M2 Ask, stream, citations
- Requirement: T-20; FR-13; UT-06.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Run the reranker with scripted outputs, fake timers and small candidate sets.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Valid ranking applied; unknown and duplicate ids dropped; empty, invalid or error output and 4,000 ms timeout fall back to RRF order with rerankFallback true and a reason; ≤ 6 candidates skips the call.

### TC-062: Retrieval pipeline end to end (mock)

- Milestone: M2 Ask, stream, citations
- Requirement: T-21; FR-12–FR-14; T-21 integration acceptance.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Ingest tests/fixtures/html in beforeAll; run the pipeline for a fixture question.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: ≤ 6 passages labelled P1..Pn; officialUrl includes the section fragment; timings present; rerankFallback false in mock.

### TC-063: Zero retrieval results

- Milestone: M2 Ask, stream, citations
- Requirement: T-21; FR-12; TRD §9.1.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Run the pipeline against an empty chunks table.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: An empty result set yields zero passages and leads to the not-found path, not an error.

### TC-064: Stream splitter at every boundary

- Milestone: M2 Ask, stream, citations
- Requirement: T-22; FR-19; UT-07.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Loop over every split point of answer + delimiter + block; cover no delimiter and delimiter at start.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: The delimiter is never streamed for any split position; text before it is streamed in order; block after it captured; partial prefixes flushed; coverage ≥ 90%.

### TC-065: Quote normalization

- Milestone: M2 Ask, stream, citations
- Requirement: T-23; FR-20; D-22; UT-08.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Normalize ligatures, full-width characters, curly quotes, em dashes and underscores.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: NFKC, lowercase, punctuation/symbols to spaces, whitespace collapse; offsets map back to original substrings.

### TC-066: Citation parsing and verification

- Milestone: M2 Ask, stream, citations
- Requirement: T-23; FR-18–FR-22; UT-09.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Run the verifier over the UT-09 fixture answers.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Markers parsed (grouped, case, ignored in code); out-of-range, missing-quote, short-quote (< 4 words) and not-in-passage citations invalid with reasons; invalid markers removed with correct spacing; zero valid → not found.

### TC-067: Suggested question matching

- Milestone: M2 Ask, stream, citations
- Requirement: T-23; FR-02; UT-19.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Match variants of each suggested question and near misses.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: matchSuggested normalizes case, whitespace and punctuation and returns the suggested id only for the six questions.

### TC-068: SSE encoding and event schemas

- Milestone: M2 Ask, stream, citations
- Requirement: T-24; FR-23; UT-12; UT-13.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Encode every event type and validate examples and mutations.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Each event encodes as one data line with the right event name; heartbeat bytes exact; Zod schemas accept the TRD examples and reject malformed payloads.

### TC-069: Client SSE parser robustness

- Milestone: M2 Ask, stream, citations
- Requirement: T-24; FR-23; UT-14.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Replay tests/fixtures/sse-streams.ts with every chunking.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Byte-by-byte replay, CRLF/CR, comments, multi-line data and missing final blank line with end() yield the same events.

### TC-070: Heartbeat while open

- Milestone: M2 Ask, stream, citations
- Requirement: T-24; FR-25; TRD §12.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Run the stream with fake timers past 30 s.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: `: ping` comment is sent every 15 s while the stream is open and stops at close.

### TC-071: Visitor hash privacy

- Milestone: M2 Ask, stream, citations
- Requirement: T-25; FR-28; D-10; UT-15.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Hash sample headers across two dates and two salts; scan output.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Header precedence and IPv6 handled; HMAC changes with date and salt; raw IP never in output or logs.

### TC-072: Per-visitor and global quotas

- Milestone: M2 Ask, stream, citations
- Requirement: T-25; FR-26; FR-27; IT-06.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Run the limiter against the test DB with concurrency.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Nth request allowed, (N+1)th rejected with scope; IP rejection does not increment global; 50 concurrent with limit 10 → exactly 10 succeed; date rollover resets.

### TC-073: Quota refund before first token

- Milestone: M2 Ask, stream, citations
- Requirement: T-25; FR-32; D-11; IT-06.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Consume a slot, refund, and check counts.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: A provider failure before the first token refunds both counters exactly once.

### TC-074: Answer orchestration event order

- Milestone: M2 Ask, stream, citations
- Requirement: T-26; FR-09; FR-22; answer.test.ts.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Run answerQuestion in mock mode with each trigger.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Default: meta → token+ → citations → done; mock:not-found → not-found; mock:invalid-citation removes exactly 2; mock:no-block uses the quote fallback.

### TC-075: Answer cache keys and staleness

- Milestone: M2 Ask, stream, citations
- Requirement: T-26; FR-29; IT-07.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Write entries under different versions and modes.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Write and current lookup; stale entries served only in readonly; key includes corpus, prompt and model versions.

### TC-076: Seed creates suggested cache

- Milestone: M2 Ask, stream, citations
- Requirement: T-26; FR-29; T-26 acceptance.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Reset, seed and count rows.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: `pnpm db:seed` creates 6 answer_cache rows.

### TC-077: Per-question cost estimate

- Milestone: M2 Ask, stream, citations
- Requirement: T-26; FR-31; UT-16.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Compute cost for fixed token counts.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Formula uses env prices; zero fallback tokens; reasoning tokens added to output.

### TC-078: Server modules import from scripts

- Milestone: M2 Ask, stream, citations
- Requirement: T-26; UT-24.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Spawn the one-line script.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: tsx with react-server condition imports db client, env and answer modules without opening a connection.

### TC-079: Query log privacy

- Milestone: M2 Ask, stream, citations
- Requirement: T-27; FR-53; FR-54; NFR-12; T-27 integration acceptance.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Ask via the pipeline under both settings and read query_log.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: question_text null when STORE_QUESTIONS=false and equal to the question when true; question_hash equals HMAC of the normalized question; no raw IP.

### TC-080: Which requests write a query_log row

- Milestone: M2 Ask, stream, citations
- Requirement: T-27; D-23; TRD §20.2.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Send each request kind and count rows.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Cache hits, rate-limited and live requests write one row; validation, origin, content-type, size, DEMO_OFF and DEMO_READONLY rejections write none.

### TC-081: Ask request validation

- Milestone: M2 Ask, stream, citations
- Requirement: T-28; FR-01; FR-24; UT-18.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Parse boundary inputs.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Trim and whitespace collapse; < 3 and > 500 rejected; unknown fields rejected; suggested id accepted.

### TC-082: Ask route statuses and stream

- Milestone: M2 Ask, stream, citations
- Requirement: T-28; FR-23; FR-24; IT-08.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Invoke the route handler directly with crafted Request objects.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Valid request streams schema-valid events in order; each JSON error returns its status (400, 403, 413, 415, 429, 503) with the error envelope; cache hit replays without quota use.

### TC-083: Passage-borne injection does not reach the answer

- Milestone: M2 Ask, stream, citations
- Requirement: T-28; FR-16; FR-22; IT-09.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Ask the mock:echo-injection question.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: With the injection fixture ingested, forbidden strings never appear in a verified answer.

### TC-084: Demo modes in the route

- Milestone: M2 Ask, stream, citations
- Requirement: T-28; FR-30; D-12; IT-08.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Call the route under each DEMO_MODE.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: readonly serves only cached suggested answers and returns 503 DEMO_READONLY otherwise; off returns 503 DEMO_OFF for all.

### TC-085: curl stream in dev:mock

- Milestone: M2 Ask, stream, citations
- Requirement: T-28; T-28 manual acceptance.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Run pnpm dev:mock and curl the endpoint.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: curl -N prints meta, token, citations, done events.

### TC-086: Health endpoint

- Milestone: M2 Ask, stream, citations
- Requirement: T-29; FR-51; IT-10.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Call the handler with good and bad DATABASE_URL.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: 200 with counts when DB is up; 503 when the DB URL points to a closed port.

### TC-087: useAsk reducer transitions

- Milestone: M2 Ask, stream, citations
- Requirement: T-30; FR-03; FR-04; FR-09–FR-11; UT-20.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Dispatch each event from each state.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Every row of TRD §15.4 transition table holds.

### TC-088: Empty state copy

- Milestone: M2 Ask, stream, citations
- Requirement: T-31; FR-02; FR-50; E2E-01.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Load / and assert strings.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: H1, lead, label, counter 0 / 500, six chips and three footer lines match PRD §9.

### TC-089: Typing counter

- Milestone: M2 Ask, stream, citations
- Requirement: T-31; FR-01; E2E-02.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Type 449, 450 and 501 characters.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Counter updates; warning colour at 450; maxLength blocks the 501st character.

### TC-090: Validation messages

- Milestone: M2 Ask, stream, citations
- Requirement: T-31; FR-01; E2E-03.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Submit invalid inputs and post 600 characters.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Empty and 2-character submits show exact copy with aria-invalid; server 400 for 600 characters is mapped.

### TC-091: Streaming answer and ask-again

- Milestone: M2 Ask, stream, citations
- Requirement: T-32; FR-04; FR-11; E2E-04.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Ask the default question.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Status phases appear; text streams; chips become buttons; done announcement; ask another question keeps the text selected and focused.

### TC-092: Sources panel and chip navigation

- Milestone: M2 Ask, stream, citations
- Requirement: T-32; FR-05; FR-06; E2E-05.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Click each chip.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Chip click focuses card; mark contains quote; link href equals officialUrl with target and rel; uncited badge shown.

### TC-093: Copy answer

- Milestone: M2 Ask, stream, citations
- Requirement: T-32; FR-07; E2E-06; UT-28.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Click Copy answer with clipboard permission.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Clipboard text matches FR-07 format; label shows Copied for 2 s.

### TC-094: Citation chips from text only

- Milestone: M2 Ask, stream, citations
- Requirement: T-32; FR-05; UT-21.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Render fixture Markdown.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Chips created from text markers, never inside code; labels P1–P6 only.

### TC-095: No raw HTML rendering

- Milestone: M2 Ask, stream, citations
- Requirement: T-32; NFR-14; D-26; T-32 acceptance.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Run the grep from T-32.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: dangerouslySetInnerHTML appears only in app/layout.tsx.

### TC-096: How this was answered

- Milestone: M2 Ask, stream, citations
- Requirement: T-33; FR-08; E2E-07.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Open the disclosure.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Table columns, rerank line, timings, tokens and cost shown as PRD §9.2.

### TC-097: Not-found state

- Milestone: M2 Ask, stream, citations
- Requirement: T-33; FR-09; E2E-08.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Ask with mock:not-found.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Exact heading and body; related reading cards; no unverified draft text.

### TC-098: Removed citations note

- Milestone: M2 Ask, stream, citations
- Requirement: T-33; FR-21; E2E-09.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Ask with mock:invalid-citation.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Invalid markers absent; note reads 2 citations were removed…

### TC-099: Quote fallback

- Milestone: M2 Ask, stream, citations
- Requirement: T-33; FR-19; E2E-10.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Ask with mock:no-block.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Answer completes with valid chips; disclosure shows fallback used.

### TC-100: Visitor rate limit state

- Milestone: M2 Ask, stream, citations
- Requirement: T-33; FR-26; E2E-11.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Ask 4 times from one IP with limit 3.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: 4th live question shows visitor copy with reset time; suggested chip still answers.

### TC-101: Global rate limit state

- Milestone: M2 Ask, stream, citations
- Requirement: T-33; FR-27; E2E-12 @isolated.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Set the global row to the cap and ask.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Global copy shown; global row restored in finally.

### TC-102: Read-only and off modes

- Milestone: M2 Ask, stream, citations
- Requirement: T-33; FR-30; E2E-13; E2E-14.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Load ports 3101 and 3102.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: 3101: banner, disabled input, chip answers with Answered in advance. 3102: demo-off copy and links.

### TC-103: Provider error states

- Milestone: M2 Ask, stream, citations
- Requirement: T-33; FR-32; E2E-15.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Ask with both triggers.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: mock:provider-error copy includes not counted; Try again resubmits; mock:error-midstream copy omits it.

### TC-104: Network error state

- Milestone: M2 Ask, stream, citations
- Requirement: T-33; E2E-16.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Ask with mock:drop and with page.route abort.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Connection lost with partial answer label for mock:drop and for an aborted request.

### TC-105: Stop

- Milestone: M2 Ask, stream, citations
- Requirement: T-33; FR-10; E2E-24.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Ask mock:slow and click Stop.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Stop shows the stopped label and partial text.

### TC-106: Cached suggested answer

- Milestone: M2 Ask, stream, citations
- Requirement: T-33; FR-29; E2E-25.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Click a chip, then ask 3 live questions.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Chip shows Answered in advance and cached disclosure line; visitor quota unchanged.

### TC-107: Accessibility scan

- Milestone: M2 Ask, stream, citations
- Requirement: T-34; NFR-09; E2E-17.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Run axe on each state.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Zero serious or critical axe violations in each state and theme.

### TC-108: Keyboard operation

- Milestone: M2 Ask, stream, citations
- Requirement: T-34; NFR-09; FR-03; FR-10; E2E-18.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Drive the page with keyboard only.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Skip link, tab order, Enter/Shift+Enter, chips, disclosure and Stop work by keyboard.

### TC-109: Responsive layout

- Milestone: M2 Ask, stream, citations
- Requirement: T-34; NFR-10; E2E-19.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Resize and measure.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: No horizontal scroll at 360 and 1024 px; sources below answer at 360.

### TC-110: E2E suite repeatable and within CI budget

- Milestone: M2 Ask, stream, citations
- Requirement: T-34; T-34 acceptance.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Run the suite twice locally; check CI timing.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Full suite passes twice on the same day; CI e2e job green and ≤ 12 minutes.

### TC-111: Streaming and citations in a real browser

- Milestone: M2 Ask, stream, citations
- Requirement: T-34; NFR-09; T-34 manual.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Manual browser pass with keyboard and VoiceOver.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Streaming text, chip activation, focus moves and live-region announcements behave as specified with VoiceOver; light and dark themes.

### TC-112: Latency budgets (warm, live)

- Milestone: M2 Ask, stream, citations
- Requirement: NFR-01–NFR-03; TRD §22.
- Preconditions: M1 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Measure locally with the live model and record; production in M4.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Measured p95 meta ≤ 2,000 ms, first token ≤ 3,500 ms, done ≤ 12,000 ms; recorded, measured on production in M4.

## M3 Evaluation and content pages

Source: PRD §7.8, FR-40–FR-48, §9.5, §9.6; TRD §15.7, §15.8, §17, §23 (UT-22, UT-23, UT-25, UT-26, UT-31, IT-11, E2E-21, E2E-22), §25.2; implementation plan T-35–T-39. Designed from the specs before the code.

| TC ID  | AC Reference             | TRD test ID / source           | Title                                           | Priority | Automatable | Expected result                                                                                                                                                                                                                                                                            |
| ------ | ------------------------ | ------------------------------ | ----------------------------------------------- | -------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TC-113 | T-35; FR-40              | UT-25 golden.test.ts           | Golden set parses and meets distribution rules  | Critical | yes         | 40 entries parse with GoldenEntry; 32/5/3 split; chapter counts per rule 2; ≥6 multi-anchor, ≥6 exact identifier, ≥6 paraphrase; ≥3 near-domain and ≥1 off-domain unanswerable; 6–25 words; reference answers ≤80 words; ids q001–q040 unique.                                             |
| TC-114 | T-35; FR-40              | TRD §17.2 schema               | GoldenEntry rejects invalid entries             | High     | yes         | Answerable without anchors, non-answerable with anchors, injection without forbidden_strings, bad id and malformed anchor are each rejected.                                                                                                                                               |
| TC-115 | T-35; FR-40              | IT-11 eval-validate.test.ts    | eval:validate checks anchors against the corpus | Critical | yes         | Passes on a golden subset whose anchors exist in fixture chunks; exits non-zero listing the missing anchor when one does not exist.                                                                                                                                                        |
| TC-116 | T-35; FR-40              | T-35 acceptance                | pnpm eval:validate on the full corpus           | Critical | yes         | Exits 0 against a database ingested with --include-fixtures and prints the distribution table matching rule 2.                                                                                                                                                                             |
| TC-117 | T-35; FR-40              | TRD §17.2 rules 4, 6, 8        | Golden content checked against the raw HTML     | High     | no          | Every answerable anchor is the section that contains the answer; for each unanswerable entry, a grep -il of its key terms in corpus/raw finds no page that answers it (a passing mention is fine and is noted); corrected example anchors carry a note. Reviewer spot-check of 10 entries. |
| TC-118 | T-36; FR-41              | UT-22 eval-metrics.test.ts     | Retrieval metrics: recall@k and reciprocal rank | Critical | yes         | recall@5/@10 and RR follow TRD §17.4 on reranked and RRF lists, including partial anchor hits and no hit (RR 0).                                                                                                                                                                           |
| TC-119 | T-36; FR-41              | UT-22 eval-metrics.test.ts     | Answer metrics and empty denominators           | Critical | yes         | Citation validity, faithfulness, false and correct refusal, injection resistance (question-borne vs passage-borne rules) match §17.4; any empty denominator reports 0.                                                                                                                     |
| TC-120 | T-36; FR-41              | UT-22 eval-metrics.test.ts     | Latency percentiles and cost                    | High     | yes         | Nearest-rank p50/p95 on known arrays (odd, even, single value); cost total and per-question per §17.4.                                                                                                                                                                                     |
| TC-121 | T-36; FR-44              | UT-26 budget.test.ts           | Budget projection and baseline scaling          | Critical | yes         | Projection equals the §17.7 formula; with a baseline the max of formula and scaled baseline cost is used; projected > EVAL_MAX_COST_USD aborts with exit 3.                                                                                                                                |
| TC-122 | T-36; FR-44              | UT-26 budget.test.ts           | Accrued cost abort and zero prices              | Critical | yes         | Accrued cost above the limit stops the run with exit 3 and no results written; any zero PRICE_* in live mode exits 2 with the §17.7 message.                                                                                                                                               |
| TC-123 | T-36; FR-42              | TRD §17.6                      | Results schema and Markdown output              | High     | yes         | A produced result validates against EvalResult; per-question pass follows §17.6 rules; Markdown has header, metrics table, failures and per-question table; file suffix -2 when the date file exists.                                                                                      |
| TC-124 | T-36; FR-41              | TRD §17.1 steps 1–2, 8         | Eval preconditions and exit codes               | High     | yes         | Mock mode without --no-write exits 2; a database without fixtures or with a mismatched embedding model exits 2 with the exact §17.1 messages.                                                                                                                                              |
| TC-125 | T-36; FR-41              | T-36 acceptance                | Mock pipeline smoke run                         | Critical | yes         | LLM_MODE=mock pnpm eval --limit 3 --no-write on a mock-ingested DB with fixtures runs all three questions, prints the metrics table and exits 0 or 1 (never 2 or 3).                                                                                                                       |
| TC-126 | T-36; A-02; FR-41; FR-42 | T-36 acceptance (live)         | First live eval run and judge review            | Critical | no          | pnpm eval writes eval/results/<date>.json and .md that validate against EvalResult; cost within EVAL_MAX_COST_USD; 10 judge decisions reviewed by hand with agreement recorded.                                                                                                            |
| TC-127 | T-37; FR-43              | UT-23 eval-thresholds.test.ts  | Floors, ceilings, regressions, no baseline      | Critical | yes         | Each floor and ceiling failure is reported with kind and limit; regression beyond maxRegression fails; no baseline skips regression and reports "No baseline"; exit 1 on any failure.                                                                                                      |
| TC-128 | T-37; FR-43              | T-37 step 2                    | First committed run passes every floor          | Critical | no          | The baseline results file committed in eval/results passes all floors and ceilings; no floor lowered.                                                                                                                                                                                      |
| TC-129 | T-37; D-17               | TRD §25.2                      | eval.yml matches the normative workflow         | High     | yes         | Workflow file equals TRD §25.2: triggers, path filter excluding eval/results, fork skip, environment eval, services, steps.                                                                                                                                                                |
| TC-130 | T-37; D-17               | T-37 acceptance                | eval.yml runs green in GitHub                   | High     | no          | workflow_dispatch run is green with cost below EVAL_MAX_COST_USD; a PR changing lib/prompts/ triggers the workflow. Needs the owner's eval environment and secret.                                                                                                                         |
| TC-131 | T-38; FR-45              | UT-31 eval-page-empty.test.tsx | /eval empty state                               | High     | yes         | EvalView with no runs shows H2 "No evaluation runs yet" and the PRD §9.5 body text.                                                                                                                                                                                                        |
| TC-132 | T-38; FR-45              | TRD §15.7                      | Results loader skips invalid files              | High     | yes         | load-results parses valid files sorted by runId and skips an invalid file with a warning log.                                                                                                                                                                                              |
| TC-133 | T-38; FR-45; FR-46       | E2E-21 eval-page.spec.ts       | /eval metric cards, floors, deltas and trend    | Critical | yes         | PRD §9.5 title, H1, lead and run line; nine metric cards with floor captions, signed deltas with a true minus, "Below floor" on the failing metric; without-rerank row; one trend SVG per metric with an accessible title.                                                                 |
| TC-134 | T-38; FR-45              | E2E-21 eval-page.spec.ts       | /eval questions table, filter and row expand    | High     | yes         | Columns and cell formats per TRD §15.7; "Failures only" shows only failing rows; expanding a row shows answer, cited passages and judge notes; keyboard operable.                                                                                                                          |
| TC-135 | T-38; FR-42              | T-38 acceptance                | Results bundled into the /eval function         | Medium   | yes         | After pnpm build, .next/server/app/eval/page.js.nft.json lists the eval/results JSON files.                                                                                                                                                                                                |
| TC-136 | T-39; FR-47              | E2E-22 how-it-works.spec.ts    | /how-it-works diagram and sections              | High     | yes         | PRD §9.6 title, H1 and lead; diagram nodes in the specified order for both lanes and the caption; H2 sections 1–8 and Privacy; Limits states the four limits.                                                                                                                              |
| TC-137 | T-39; FR-48              | E2E-22 how-it-works.spec.ts    | Privacy anchor and links                        | High     | yes         | #privacy section has the exact PRD privacy text; footer and the under-input link lead to /how-it-works#privacy.                                                                                                                                                                            |
| TC-138 | T-39; FR-47              | T-39 acceptance                | Numbers come from lib/config.ts                 | Medium   | yes         | grep -nE '\b(40                                                                                                                                                                                                                                                                            | 60  | 20  | 500 | 800 | 80)\b' on the page and diagram returns nothing outside Tailwind class names. |
| TC-139 | T-38; T-39; NFR-09       | M3 manual                      | /eval and /how-it-works in a real browser       | Medium   | no          | Light and dark themes, keyboard-only use, diagram reflows to one column below 640 px, trend charts readable.                                                                                                                                                                               |

### TC-113: Golden set parses and meets distribution rules

- Milestone: M3 Evaluation and content pages
- Requirement: T-35; FR-40; UT-25 golden.test.ts.
- Preconditions: M2 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Parse eval/golden.jsonl line by line and check rules 1–5 and 7 of TRD §17.2.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: 40 entries parse with GoldenEntry; 32/5/3 split; chapter counts per rule 2; ≥6 multi-anchor, ≥6 exact identifier, ≥6 paraphrase; ≥3 near-domain and ≥1 off-domain unanswerable; 6–25 words; reference answers ≤80 words; ids q001–q040 unique.

### TC-114: GoldenEntry rejects invalid entries

- Milestone: M3 Evaluation and content pages
- Requirement: T-35; FR-40; TRD §17.2 schema.
- Preconditions: M2 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Feed one invalid entry per superRefine rule and regex to GoldenEntry.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Answerable without anchors, non-answerable with anchors, injection without forbidden_strings, bad id and malformed anchor are each rejected.

### TC-115: eval:validate checks anchors against the corpus

- Milestone: M3 Evaluation and content pages
- Requirement: T-35; FR-40; IT-11 eval-validate.test.ts.
- Preconditions: M2 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Ingest fixtures into the test DB; run the validator on a valid subset, then on a subset with one unknown anchor.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Passes on a golden subset whose anchors exist in fixture chunks; exits non-zero listing the missing anchor when one does not exist.

### TC-116: pnpm eval:validate on the full corpus

- Milestone: M3 Evaluation and content pages
- Requirement: T-35; FR-40; T-35 acceptance.
- Preconditions: M2 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. pnpm ingest --offline --include-fixtures; pnpm eval:validate.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Exits 0 against a database ingested with --include-fixtures and prints the distribution table matching rule 2.

### TC-117: Golden content checked against the raw HTML

- Milestone: M3 Evaluation and content pages
- Requirement: T-35; FR-40; TRD §17.2 rules 4, 6, 8.
- Preconditions: M2 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Open the raw HTML for 10 sampled answerable entries; grep the unanswerable key terms.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Every answerable anchor is the section that contains the answer; for each unanswerable entry, a grep -il of its key terms in corpus/raw finds no page that answers it (a passing mention is fine and is noted); corrected example anchors carry a note. Reviewer spot-check of 10 entries.

### TC-118: Retrieval metrics: recall@k and reciprocal rank

- Milestone: M3 Evaluation and content pages
- Requirement: T-36; FR-41; UT-22 eval-metrics.test.ts.
- Preconditions: M2 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Compute metrics on hand-built per-question records with known answers.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: recall@5/@10 and RR follow TRD §17.4 on reranked and RRF lists, including partial anchor hits and no hit (RR 0).

### TC-119: Answer metrics and empty denominators

- Milestone: M3 Evaluation and content pages
- Requirement: T-36; FR-41; UT-22 eval-metrics.test.ts.
- Preconditions: M2 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Aggregate synthetic records covering each outcome and an all-not-found run.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Citation validity, faithfulness, false and correct refusal, injection resistance (question-borne vs passage-borne rules) match §17.4; any empty denominator reports 0.

### TC-120: Latency percentiles and cost

- Milestone: M3 Evaluation and content pages
- Requirement: T-36; FR-41; UT-22 eval-metrics.test.ts.
- Preconditions: M2 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Run the percentile and cost helpers on fixed inputs.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Nearest-rank p50/p95 on known arrays (odd, even, single value); cost total and per-question per §17.4.

### TC-121: Budget projection and baseline scaling

- Milestone: M3 Evaluation and content pages
- Requirement: T-36; FR-44; UT-26 budget.test.ts.
- Preconditions: M2 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Call the budget helpers with fixed prices, N, |A| and a baseline.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Projection equals the §17.7 formula; with a baseline the max of formula and scaled baseline cost is used; projected > EVAL_MAX_COST_USD aborts with exit 3.

### TC-122: Accrued cost abort and zero prices

- Milestone: M3 Evaluation and content pages
- Requirement: T-36; FR-44; UT-26 budget.test.ts.
- Preconditions: M2 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Drive the accrual tracker past the limit; validate env with a zero price.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Accrued cost above the limit stops the run with exit 3 and no results written; any zero PRICE_* in live mode exits 2 with the §17.7 message.

### TC-123: Results schema and Markdown output

- Milestone: M3 Evaluation and content pages
- Requirement: T-36; FR-42; TRD §17.6.
- Preconditions: M2 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Build a result from synthetic records; render Markdown; write twice to a temp dir.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: A produced result validates against EvalResult; per-question pass follows §17.6 rules; Markdown has header, metrics table, failures and per-question table; file suffix -2 when the date file exists.

### TC-124: Eval preconditions and exit codes

- Milestone: M3 Evaluation and content pages
- Requirement: T-36; FR-41; TRD §17.1 steps 1–2, 8.
- Preconditions: M2 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Run the eval entry with each misconfiguration against the test DB.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Mock mode without --no-write exits 2; a database without fixtures or with a mismatched embedding model exits 2 with the exact §17.1 messages.

### TC-125: Mock pipeline smoke run

- Milestone: M3 Evaluation and content pages
- Requirement: T-36; FR-41; T-36 acceptance.
- Preconditions: M2 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. LLM_MODE=mock pnpm ingest --offline --include-fixtures; LLM_MODE=mock pnpm eval --limit 3 --no-write.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: LLM_MODE=mock pnpm eval --limit 3 --no-write on a mock-ingested DB with fixtures runs all three questions, prints the metrics table and exits 0 or 1 (never 2 or 3).

### TC-126: First live eval run and judge review

- Milestone: M3 Evaluation and content pages
- Requirement: T-36; A-02; FR-41; FR-42; T-36 acceptance (live).
- Preconditions: M2 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Live: pnpm db:reset; pnpm ingest --offline --include-fixtures; pnpm eval; review 10 judge rows.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: pnpm eval writes eval/results/<date>.json and .md that validate against EvalResult; cost within EVAL_MAX_COST_USD; 10 judge decisions reviewed by hand with agreement recorded.

### TC-127: Floors, ceilings, regressions, no baseline

- Milestone: M3 Evaluation and content pages
- Requirement: T-37; FR-43; UT-23 eval-thresholds.test.ts.
- Preconditions: M2 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Check synthetic metrics against thresholds.json with and without a baseline.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Each floor and ceiling failure is reported with kind and limit; regression beyond maxRegression fails; no baseline skips regression and reports "No baseline"; exit 1 on any failure.

### TC-128: First committed run passes every floor

- Milestone: M3 Evaluation and content pages
- Requirement: T-37; FR-43; T-37 step 2.
- Preconditions: M2 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Inspect the committed results file and thresholds.json diff.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: The baseline results file committed in eval/results passes all floors and ceilings; no floor lowered.

### TC-129: eval.yml matches the normative workflow

- Milestone: M3 Evaluation and content pages
- Requirement: T-37; D-17; TRD §25.2.
- Preconditions: M2 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Diff .github/workflows/eval.yml against the TRD block.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Workflow file equals TRD §25.2: triggers, path filter excluding eval/results, fork skip, environment eval, services, steps.

### TC-130: eval.yml runs green in GitHub

- Milestone: M3 Evaluation and content pages
- Requirement: T-37; D-17; T-37 acceptance.
- Preconditions: M2 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Owner sets up environment; dispatch the workflow; open a test PR.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: workflow_dispatch run is green with cost below EVAL_MAX_COST_USD; a PR changing lib/prompts/ triggers the workflow. Needs the owner's eval environment and secret.

### TC-131: /eval empty state

- Milestone: M3 Evaluation and content pages
- Requirement: T-38; FR-45; UT-31 eval-page-empty.test.tsx.
- Preconditions: M2 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Render <EvalView runs={[]} /> in jsdom.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: EvalView with no runs shows H2 "No evaluation runs yet" and the PRD §9.5 body text.

### TC-132: Results loader skips invalid files

- Milestone: M3 Evaluation and content pages
- Requirement: T-38; FR-45; TRD §15.7.
- Preconditions: M2 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Point the loader at a temp dir with two valid files and one invalid file.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: load-results parses valid files sorted by runId and skips an invalid file with a warning log.

### TC-133: /eval metric cards, floors, deltas and trend

- Milestone: M3 Evaluation and content pages
- Requirement: T-38; FR-45; FR-46; E2E-21 eval-page.spec.ts.
- Preconditions: M2 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Serve the fixture results (two runs, one failing); open /eval.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: PRD §9.5 title, H1, lead and run line; nine metric cards with floor captions, signed deltas with a true minus, "Below floor" on the failing metric; without-rerank row; one trend SVG per metric with an accessible title.

### TC-134: /eval questions table, filter and row expand

- Milestone: M3 Evaluation and content pages
- Requirement: T-38; FR-45; E2E-21 eval-page.spec.ts.
- Preconditions: M2 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. On /eval, toggle the filter and expand a row by keyboard.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Columns and cell formats per TRD §15.7; "Failures only" shows only failing rows; expanding a row shows answer, cited passages and judge notes; keyboard operable.

### TC-135: Results bundled into the /eval function

- Milestone: M3 Evaluation and content pages
- Requirement: T-38; FR-42; T-38 acceptance.
- Preconditions: M2 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. pnpm build; inspect the trace file.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: After pnpm build, .next/server/app/eval/page.js.nft.json lists the eval/results JSON files.

### TC-136: /how-it-works diagram and sections

- Milestone: M3 Evaluation and content pages
- Requirement: T-39; FR-47; E2E-22 how-it-works.spec.ts.
- Preconditions: M2 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Open /how-it-works.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: PRD §9.6 title, H1 and lead; diagram nodes in the specified order for both lanes and the caption; H2 sections 1–8 and Privacy; Limits states the four limits.

### TC-137: Privacy anchor and links

- Milestone: M3 Evaluation and content pages
- Requirement: T-39; FR-48; E2E-22 how-it-works.spec.ts.
- Preconditions: M2 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Follow the footer and under-input links.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: #privacy section has the exact PRD privacy text; footer and the under-input link lead to /how-it-works#privacy.

### TC-138: Numbers come from lib/config.ts

- Milestone: M3 Evaluation and content pages
- Requirement: T-39; FR-47; T-39 acceptance.
- Preconditions: M2 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Run the grep from the plan.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: grep -nE '\b(40|60|20|500|800|80)\b' on the page and diagram returns nothing outside Tailwind class names.

### TC-139: /eval and /how-it-works in a real browser

- Milestone: M3 Evaluation and content pages
- Requirement: T-38; T-39; NFR-09; M3 manual.
- Preconditions: M2 complete; the corresponding task implemented; mock mode unless the case says live.
- Steps:
  1. Live browser pass on both pages.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Light and dark themes, keyboard-only use, diagram reflows to one column below 640 px, trend charts readable.

## M4 Polish and deploy

Source: PRD NFR-04, NFR-07–NFR-14, FR-29, FR-57, FR-58, §11, §12; TRD §15.3, §15.6, §19, §21.2, §22, §24 (A-06–A-09), §25.4, §26, §27, §23 (E2E-17–E2E-20, E2E-23); implementation plan T-40–T-45. Designed from the specs before the code. E2E-17–E2E-20 already exist as TC-107–TC-110; the cases below cover what they leave out. TC-022, TC-111, TC-112 and TC-139 stay open and are closed in this milestone.

| TC ID  | AC Reference           | TRD test ID / source            | Title                                              | Priority | Automatable | Expected result                                                                                                                                                                                                                                                                 |
| ------ | ---------------------- | ------------------------------- | -------------------------------------------------- | -------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-140 | T-40; NFR-10           | T-40 step 3; E2E-19             | Long code lines scroll inside their block          | High     | yes         | At 360 px an answer with a long line in a code block and a passage with a long unbroken line scroll inside their own block (overflow-x auto, scrollWidth > clientWidth on the block) while the page has no horizontal scroll.                                                   |
| TC-141 | T-40; NFR-10           | E2E-19                          | No horizontal scroll at 1920 px                    | Medium   | yes         | At 1920 × 1080, /, the done state, /eval, /how-it-works and the 404 page have scrollWidth <= clientWidth.                                                                                                                                                                       |
| TC-142 | T-40; NFR-09           | TRD §15.6                       | Visible focus ring on every interactive element    | High     | yes         | Each focusable element reached by Tab on /, /eval and /how-it-works shows a 2 px solid outline in --accent with 2 px offset under :focus-visible.                                                                                                                               |
| TC-143 | T-40; NFR-09           | TRD §15.6                       | Reduced motion respected                           | Medium   | yes         | With prefers-reduced-motion: reduce, html scroll-behavior is auto and focus outlines have no transition; activating a citation chip moves focus without smooth scrolling.                                                                                                       |
| TC-144 | T-40; NFR-09           | TRD §15.6                       | Touch targets at least 24 × 24 px                  | Medium   | yes         | At 360 px every visible button, link and chip on /, the done state, /eval and /how-it-works has a hit area of at least 24 × 24 px, or meets the WCAG 2.2 spacing exception (axe target-size rule passes).                                                                       |
| TC-145 | T-40; NFR-09           | TRD §15.3; D-26                 | No hydration or console errors on page load        | High     | yes         | Loading /, /eval and /how-it-works in both themes logs no console error or React hydration warning (including the theme-script nonce).                                                                                                                                          |
| TC-146 | T-40; NFR-08           | TRD §22                         | First-load JavaScript for / within 180 KB gzip     | High     | yes         | The TRD §22 command against pnpm build && pnpm start prints ≤ 180 KB.                                                                                                                                                                                                           |
| TC-147 | T-40; NFR-07           | T-40 step 4                     | Lighthouse mobile on the local production build    | High     | no          | Lighthouse mobile on pnpm start: Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95, LCP ≤ 2.5 s, CLS ≤ 0.05; scores recorded.                                                                                                                                           |
| TC-148 | T-41; NFR-14           | E2E-23 security-headers.spec.ts | CSP nonce and security headers                     | Critical | yes         | Every page and /api/health response carries the TRD §19 CSP with a nonce that differs between two requests; every inline script carries that nonce; HSTS, X-Content-Type-Options, Referrer-Policy, X-Frame-Options, COOP, Permissions-Policy and X-Request-Id match §19 item 4. |
| TC-149 | T-41; NFR-14           | TRD §11.2; T-41 step 4          | Cross-origin POST is rejected                      | Critical | yes         | POST /api/ask with Origin: https://evil.example returns 403 with the origin error code and no stream.                                                                                                                                                                           |
| TC-150 | T-41; NFR-12; NFR-14   | T-41 acceptance                 | No process.env or console outside allowed files    | High     | yes         | grep -rn "process.env" app lib components hooks middleware.ts excluding lib/env.ts prints nothing; grep -rn "console\." app lib components hooks prints nothing.                                                                                                                |
| TC-151 | T-41; NFR-14           | TRD §19 item 5; TRD §8          | Client code cannot import server modules           | High     | yes         | ESLint no-restricted-imports (final TRD §8 rules) reports an error when a file under components/ or hooks/ imports lib/env, lib/db, lib/llm, lib/logger, lib/ratelimit or another server-only module.                                                                           |
| TC-152 | T-41; NFR-14           | TRD §19 item 9                  | Production dependency audit clean                  | High     | yes         | pnpm audit --prod --audit-level high exits 0.                                                                                                                                                                                                                                   |
| TC-153 | T-41; NFR-12; NFR-14   | TRD §19                         | Security checklist reviewed with evidence          | High     | no          | Each of the eleven TRD §19 items is checked with evidence (file, test or command) and listed in the T-41 notes; Dependabot alerts and secret scanning with push protection are enabled on the repository.                                                                       |
| TC-154 | T-42; FR-29; D-16      | T-42 acceptance                 | Production database migrated and ingested          | Critical | no          | migrate.yml with input migrate is green; chunks count equals the local live ingest count; answer_cache has 6 rows; no fixture documents.                                                                                                                                        |
| TC-155 | T-42; A-07; NFR-13     | TRD §26.1 steps 5–6             | Supabase hardening and free-plan limits            | High     | no          | Data API is off; A-07 findings (size limit, pause policy, pooler activity, connection limits) recorded in the decisions log.                                                                                                                                                    |
| TC-156 | T-42; A-06; NFR-13     | TRD §26.2; §21.2                | OpenAI production project capped                   | Critical | no          | Production project key restricted to the project; monthly budget with 50% alert; prepaid credit with auto-recharge off; data sharing off (D-82); worst-case monthly LLM cost from §21.2 within the budget, with RATE_LIMIT_GLOBAL_DAILY lowered if needed.                      |
| TC-157 | T-43; NFR-04; D-20     | T-43 acceptance                 | Production health and CSP                          | Critical | no          | https://sourced.firatkil.com/api/health returns status ok, db ok, llmMode live; the home page response has the nonce CSP; DNS resolves through the Vercel CNAME with a valid certificate.                                                                                       |
| TC-158 | T-43; A-08; A-09       | TRD §24                         | Function duration and IP header trust on a preview | High     | no          | maxDuration set per the verified Hobby limit; a spoofed x-real-ip on a preview deployment does not change the visitor hash; findings recorded in the decisions log.                                                                                                             |
| TC-159 | T-43; NFR-04           | TRD §25.4                       | Keepalive workflow                                 | High     | no          | keepalive.yml is byte-identical to TRD §25.4 with schedule 17 6 */3 * *; a workflow_dispatch run is green and its log shows "db":"ok".                                                                                                                                          |
| TC-160 | T-43; FR-29; NFR-12    | T-43 acceptance                 | Production answers and privacy                     | Critical | no          | One suggested and one live question answer with verified citations on production; the two newest query_log rows have source cache and live and question_text null.                                                                                                              |
| TC-161 | T-43; NFR-01–NFR-07    | TRD §22                         | Production performance measurements                | Medium   | no          | Warm p95 meta, first token and done, cold start, cached answer and Lighthouse median recorded against their budgets; at most ordinary manual use, no load testing.                                                                                                              |
| TC-162 | T-44; FR-57; G-1       | TRD §27                         | README sections complete                           | High     | yes         | README.md contains every TRD §27 section in order and the metrics table copied from the latest eval/results/*.md.                                                                                                                                                               |
| TC-163 | T-44; PRD §11          | T-44 step 4                     | Fresh clone without an API key                     | High     | no          | On a clean directory, following only the README "Run locally without an API key" commands reaches a working mock ask page in ≤ 15 minutes.                                                                                                                                      |
| TC-164 | T-44; G-4              | T-44 step 2                     | Demo GIF                                           | Medium   | no          | docs/assets/demo.gif is light theme, 1200 px wide, ≤ 20 s and ≤ 4 MB.                                                                                                                                                                                                           |
| TC-165 | T-44; FR-58            | T-44 files                      | Page metadata and Open Graph image                 | Low      | yes         | /, /eval and /how-it-works have a title, a description and an og:image that returns an image, or the item is skipped with a decisions log entry.                                                                                                                                |
| TC-166 | T-45; PRD §11; PRD §12 | Release checklist               | Release v1.0.0                                     | High     | no          | Every release checklist item is checked; tag v1.0.0 and GitHub release with the CHANGELOG entry exist; repository description, topics and website set.                                                                                                                          |

### TC-140: Long code lines scroll inside their block

- Milestone: M4 Polish and deploy
- Requirement: T-40; NFR-10; T-40 step 3; E2E-19.
- Preconditions: M3 complete; the corresponding task implemented; mock mode against pnpm build && pnpm start unless the case says otherwise.
- Steps:
  1. Ask a mock question whose answer and passages contain a 200-character code line at 360 × 740; inspect the block and the document.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: At 360 px an answer with a long line in a code block and a passage with a long unbroken line scroll inside their own block (overflow-x auto, scrollWidth > clientWidth on the block) while the page has no horizontal scroll.

### TC-141: No horizontal scroll at 1920 px

- Milestone: M4 Polish and deploy
- Requirement: T-40; NFR-10; E2E-19.
- Preconditions: M3 complete; the corresponding task implemented; mock mode against pnpm build && pnpm start unless the case says otherwise.
- Steps:
  1. Repeat the E2E-19 checks at 1920 × 1080.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: At 1920 × 1080, /, the done state, /eval, /how-it-works and the 404 page have scrollWidth <= clientWidth.

### TC-142: Visible focus ring on every interactive element

- Milestone: M4 Polish and deploy
- Requirement: T-40; NFR-09; TRD §15.6.
- Preconditions: M3 complete; the corresponding task implemented; mock mode against pnpm build && pnpm start unless the case says otherwise.
- Steps:
  1. Tab through each page and read the computed outline of the focused element.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Each focusable element reached by Tab on /, /eval and /how-it-works shows a 2 px solid outline in --accent with 2 px offset under :focus-visible.

### TC-143: Reduced motion respected

- Milestone: M4 Polish and deploy
- Requirement: T-40; NFR-09; TRD §15.6.
- Preconditions: M3 complete; the corresponding task implemented; mock mode against pnpm build && pnpm start unless the case says otherwise.
- Steps:
  1. Emulate reducedMotion: 'reduce'; check computed styles and chip activation.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: With prefers-reduced-motion: reduce, html scroll-behavior is auto and focus outlines have no transition; activating a citation chip moves focus without smooth scrolling.

### TC-144: Touch targets at least 24 × 24 px

- Milestone: M4 Polish and deploy
- Requirement: T-40; NFR-09; TRD §15.6.
- Preconditions: M3 complete; the corresponding task implemented; mock mode against pnpm build && pnpm start unless the case says otherwise.
- Steps:
  1. Run axe with the target-size rule and measure bounding boxes of interactive elements.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: At 360 px every visible button, link and chip on /, the done state, /eval and /how-it-works has a hit area of at least 24 × 24 px, or meets the WCAG 2.2 spacing exception (axe target-size rule passes).

### TC-145: No hydration or console errors on page load

- Milestone: M4 Polish and deploy
- Requirement: T-40; NFR-09; TRD §15.3; D-26.
- Preconditions: M3 complete; the corresponding task implemented; mock mode against pnpm build && pnpm start unless the case says otherwise.
- Steps:
  1. Collect console messages while loading each page with a stored theme and with none.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Loading /, /eval and /how-it-works in both themes logs no console error or React hydration warning (including the theme-script nonce).

### TC-146: First-load JavaScript for / within 180 KB gzip

- Milestone: M4 Polish and deploy
- Requirement: T-40; NFR-08; TRD §22.
- Preconditions: M3 complete; the corresponding task implemented; mock mode against pnpm build && pnpm start unless the case says otherwise.
- Steps:
  1. pnpm build; pnpm start; run the §22 measurement command.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: The TRD §22 command against pnpm build && pnpm start prints ≤ 180 KB.

### TC-147: Lighthouse mobile on the local production build

- Milestone: M4 Polish and deploy
- Requirement: T-40; NFR-07; T-40 step 4.
- Preconditions: M3 complete; the corresponding task implemented; mock mode against pnpm build && pnpm start unless the case says otherwise.
- Steps:
  1. Run Lighthouse (mobile, simulated throttling) three times on / and take the median.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Lighthouse mobile on pnpm start: Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95, LCP ≤ 2.5 s, CLS ≤ 0.05; scores recorded.

### TC-148: CSP nonce and security headers

- Milestone: M4 Polish and deploy
- Requirement: T-41; NFR-14; E2E-23 security-headers.spec.ts.
- Preconditions: M3 complete; the corresponding task implemented; mock mode against pnpm build && pnpm start unless the case says otherwise.
- Steps:
  1. Request / twice and /api/health; compare headers and the nonce attributes of script tags.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Every page and /api/health response carries the TRD §19 CSP with a nonce that differs between two requests; every inline script carries that nonce; HSTS, X-Content-Type-Options, Referrer-Policy, X-Frame-Options, COOP, Permissions-Policy and X-Request-Id match §19 item 4.

### TC-149: Cross-origin POST is rejected

- Milestone: M4 Polish and deploy
- Requirement: T-41; NFR-14; TRD §11.2; T-41 step 4.
- Preconditions: M3 complete; the corresponding task implemented; mock mode against pnpm build && pnpm start unless the case says otherwise.
- Steps:
  1. curl -X POST with a foreign Origin header against pnpm start.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: POST /api/ask with Origin: https://evil.example returns 403 with the origin error code and no stream.

### TC-150: No process.env or console outside allowed files

- Milestone: M4 Polish and deploy
- Requirement: T-41; NFR-12; NFR-14; T-41 acceptance.
- Preconditions: M3 complete; the corresponding task implemented; mock mode against pnpm build && pnpm start unless the case says otherwise.
- Steps:
  1. Run both greps from the plan.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: grep -rn "process.env" app lib components hooks middleware.ts excluding lib/env.ts prints nothing; grep -rn "console\." app lib components hooks prints nothing.

### TC-151: Client code cannot import server modules

- Milestone: M4 Polish and deploy
- Requirement: T-41; NFR-14; TRD §19 item 5; TRD §8.
- Preconditions: M3 complete; the corresponding task implemented; mock mode against pnpm build && pnpm start unless the case says otherwise.
- Steps:
  1. Lint a temporary violating file per restricted module.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: ESLint no-restricted-imports (final TRD §8 rules) reports an error when a file under components/ or hooks/ imports lib/env, lib/db, lib/llm, lib/logger, lib/ratelimit or another server-only module.

### TC-152: Production dependency audit clean

- Milestone: M4 Polish and deploy
- Requirement: T-41; NFR-14; TRD §19 item 9.
- Preconditions: M3 complete; the corresponding task implemented; mock mode against pnpm build && pnpm start unless the case says otherwise.
- Steps:
  1. Run the audit.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: pnpm audit --prod --audit-level high exits 0.

### TC-153: Security checklist reviewed with evidence

- Milestone: M4 Polish and deploy
- Requirement: T-41; NFR-12; NFR-14; TRD §19.
- Preconditions: M3 complete; the corresponding task implemented; mock mode against pnpm build && pnpm start unless the case says otherwise.
- Steps:
  1. Walk the §19 list; read the repository security settings.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Each of the eleven TRD §19 items is checked with evidence (file, test or command) and listed in the T-41 notes; Dependabot alerts and secret scanning with push protection are enabled on the repository.

### TC-154: Production database migrated and ingested

- Milestone: M4 Polish and deploy
- Requirement: T-42; FR-29; D-16; T-42 acceptance.
- Preconditions: M3 complete; the corresponding task implemented; production or the owner's accounts.
- Steps:
  1. Run migrate.yml; query the production database with the migration URL.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: migrate.yml with input migrate is green; chunks count equals the local live ingest count; answer_cache has 6 rows; no fixture documents.

### TC-155: Supabase hardening and free-plan limits

- Milestone: M4 Polish and deploy
- Requirement: T-42; A-07; NFR-13; TRD §26.1 steps 5–6.
- Preconditions: M3 complete; the corresponding task implemented; production or the owner's accounts.
- Steps:
  1. Owner checks the dashboard; reviewer records the findings.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Data API is off; A-07 findings (size limit, pause policy, pooler activity, connection limits) recorded in the decisions log.

### TC-156: OpenAI production project capped

- Milestone: M4 Polish and deploy
- Requirement: T-42; A-06; NFR-13; TRD §26.2; §21.2.
- Preconditions: M3 complete; the corresponding task implemented; production or the owner's accounts.
- Steps:
  1. Owner confirms the settings; compute the worst case from the six suggested questions' costUsdEstimate.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Production project key restricted to the project; monthly budget with 50% alert; prepaid credit with auto-recharge off; data sharing off (D-82); worst-case monthly LLM cost from §21.2 within the budget, with RATE_LIMIT_GLOBAL_DAILY lowered if needed.

### TC-157: Production health and CSP

- Milestone: M4 Polish and deploy
- Requirement: T-43; NFR-04; D-20; T-43 acceptance.
- Preconditions: M3 complete; the corresponding task implemented; production or the owner's accounts.
- Steps:
  1. curl the health endpoint and headers; dig the CNAME.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: https://sourced.firatkil.com/api/health returns status ok, db ok, llmMode live; the home page response has the nonce CSP; DNS resolves through the Vercel CNAME with a valid certificate.

### TC-158: Function duration and IP header trust on a preview

- Milestone: M4 Polish and deploy
- Requirement: T-43; A-08; A-09; TRD §24.
- Preconditions: M3 complete; the corresponding task implemented; production or the owner's accounts.
- Steps:
  1. Deploy a preview; send a request with a spoofed x-real-ip; compare hashes.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: maxDuration set per the verified Hobby limit; a spoofed x-real-ip on a preview deployment does not change the visitor hash; findings recorded in the decisions log.

### TC-159: Keepalive workflow

- Milestone: M4 Polish and deploy
- Requirement: T-43; NFR-04; TRD §25.4.
- Preconditions: M3 complete; the corresponding task implemented; production or the owner's accounts.
- Steps:
  1. Diff the file against the TRD; dispatch the workflow.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: keepalive.yml is byte-identical to TRD §25.4 with schedule 17 6 */3 * *; a workflow_dispatch run is green and its log shows "db":"ok".

### TC-160: Production answers and privacy

- Milestone: M4 Polish and deploy
- Requirement: T-43; FR-29; NFR-12; T-43 acceptance.
- Preconditions: M3 complete; the corresponding task implemented; production or the owner's accounts.
- Steps:
  1. Ask both questions in a browser; query query_log.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: One suggested and one live question answer with verified citations on production; the two newest query_log rows have source cache and live and question_text null.

### TC-161: Production performance measurements

- Milestone: M4 Polish and deploy
- Requirement: T-43; NFR-01–NFR-07; TRD §22.
- Preconditions: M3 complete; the corresponding task implemented; production or the owner's accounts.
- Steps:
  1. Collect from query_log over normal use during the first week; Lighthouse three runs.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Warm p95 meta, first token and done, cold start, cached answer and Lighthouse median recorded against their budgets; at most ordinary manual use, no load testing.

### TC-162: README sections complete

- Milestone: M4 Polish and deploy
- Requirement: T-44; FR-57; G-1; TRD §27.
- Preconditions: M3 complete; the corresponding task implemented; mock mode against pnpm build && pnpm start unless the case says otherwise.
- Steps:
  1. Compare README headings with the §27 list; diff the metrics table.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: README.md contains every TRD §27 section in order and the metrics table copied from the latest eval/results/*.md.

### TC-163: Fresh clone without an API key

- Milestone: M4 Polish and deploy
- Requirement: T-44; PRD §11; T-44 step 4.
- Preconditions: M3 complete; the corresponding task implemented; production or the owner's accounts.
- Steps:
  1. Clone into a temp directory and time the README steps.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: On a clean directory, following only the README "Run locally without an API key" commands reaches a working mock ask page in ≤ 15 minutes.

### TC-164: Demo GIF

- Milestone: M4 Polish and deploy
- Requirement: T-44; G-4; T-44 step 2.
- Preconditions: M3 complete; the corresponding task implemented; production or the owner's accounts.
- Steps:
  1. ls -lh and ffprobe the GIF.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: docs/assets/demo.gif is light theme, 1200 px wide, ≤ 20 s and ≤ 4 MB.

### TC-165: Page metadata and Open Graph image

- Milestone: M4 Polish and deploy
- Requirement: T-44; FR-58; T-44 files.
- Preconditions: M3 complete; the corresponding task implemented; mock mode against pnpm build && pnpm start unless the case says otherwise.
- Steps:
  1. Read the head tags of each page and fetch the og:image URL.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: /, /eval and /how-it-works have a title, a description and an og:image that returns an image, or the item is skipped with a decisions log entry.

### TC-166: Release v1.0.0

- Milestone: M4 Polish and deploy
- Requirement: T-45; PRD §11; PRD §12; Release checklist.
- Preconditions: M3 complete; the corresponding task implemented; production or the owner's accounts.
- Steps:
  1. Walk the checklist; gh release view v1.0.0; gh repo view.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Every release checklist item is checked; tag v1.0.0 and GitHub release with the CHANGELOG entry exist; repository description, topics and website set.

## v1.1 Chat redesign

Source: docs/REDESIGN.md (D-91) and the "Sourced redesign" canvas. Designed from the spec before the R2 code.

| TC ID  | AC Reference                    | TRD test ID / source                    | Title                                                  | Priority | Automatable | Expected result                                                                                                                                                                                                                                 |
| ------ | ------------------------------- | --------------------------------------- | ------------------------------------------------------ | -------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-167 | D-91; REDESIGN §3, §4           | ask-history.spec.ts                     | Chat history and New chat                              | High     | yes         | Turns stack in order with independent requests; the rail lists them and moves focus to a turn; New chat clears them; reload clears them; only one request runs at a time.                                                                       |
| TC-168 | D-91; REDESIGN §3.3, §4.5       | ask-sources.spec.ts                     | Source viewer and source cards                         | Critical | yes         | A chip or card opens the viewer on its passage with every verified quote marked; previous and next move across cited passages; Esc and Close return focus to the opener; the postgresql.org link has target _blank and rel noopener noreferrer. |
| TC-169 | D-91; REDESIGN §3, §3.3; NFR-09 | ask-sources.spec.ts; keyboard.spec.ts   | Bottom sheet and rail menu are modal with a focus trap | High     | yes         | Below 1024 px the viewer is a modal sheet and below 768 px the rail is a menu dialog; Tab and Shift+Tab stay inside; Esc closes and returns focus.                                                                                              |
| TC-170 | D-91; REDESIGN §5               | ask-code.spec.ts                        | SQL highlighting and Copy code                         | High     | yes         | A fenced SQL block renders token spans in the code colours; Copy code copies the exact source, shows Copied for 2 s and announces it.                                                                                                           |
| TC-171 | D-91; REDESIGN §5.2             | highlight-sql.test.ts                   | SQL tokenizer                                          | High     | yes         | Each token type, dollar quotes and comments are classified; every corpus SQL block round-trips exactly; 10,000 characters tokenize in under 20 ms.                                                                                              |
| TC-172 | D-91; REDESIGN §6, §7           | eval-page.spec.ts; how-it-works.spec.ts | Redesigned /eval and /how-it-works                     | High     | yes         | Grouped metric cards with gates, rerank values, trends and filter counts; four-step list, prose and Privacy and Limits cards; copy as REDESIGN §7.                                                                                              |
| TC-173 | D-91; REDESIGN §9               | Canvas comparison                       | App matches the design canvas                          | Medium   | no          | Desktop chat with source viewer, welcome, phone sheet, states, /eval and /how-it-works match the canvas in light and dark themes.                                                                                                               |

### TC-167: Chat history and New chat

- Milestone: v1.1 Chat redesign
- Requirement: D-91; REDESIGN §3, §4; ask-history.spec.ts.
- Preconditions: mock mode against pnpm build && pnpm start.
- Steps:
  1. Run the listed spec or compare with the canvas.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Turns stack in order with independent requests; the rail lists them and moves focus to a turn; New chat clears them; reload clears them; only one request runs at a time.

### TC-168: Source viewer and source cards

- Milestone: v1.1 Chat redesign
- Requirement: D-91; REDESIGN §3.3, §4.5; ask-sources.spec.ts.
- Preconditions: mock mode against pnpm build && pnpm start.
- Steps:
  1. Run the listed spec or compare with the canvas.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: A chip or card opens the viewer on its passage with every verified quote marked; previous and next move across cited passages; Esc and Close return focus to the opener; the postgresql.org link has target _blank and rel noopener noreferrer.

### TC-169: Bottom sheet and rail menu are modal with a focus trap

- Milestone: v1.1 Chat redesign
- Requirement: D-91; REDESIGN §3, §3.3; NFR-09; ask-sources.spec.ts; keyboard.spec.ts.
- Preconditions: mock mode against pnpm build && pnpm start.
- Steps:
  1. Run the listed spec or compare with the canvas.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Below 1024 px the viewer is a modal sheet and below 768 px the rail is a menu dialog; Tab and Shift+Tab stay inside; Esc closes and returns focus.

### TC-170: SQL highlighting and Copy code

- Milestone: v1.1 Chat redesign
- Requirement: D-91; REDESIGN §5; ask-code.spec.ts.
- Preconditions: mock mode against pnpm build && pnpm start.
- Steps:
  1. Run the listed spec or compare with the canvas.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: A fenced SQL block renders token spans in the code colours; Copy code copies the exact source, shows Copied for 2 s and announces it.

### TC-171: SQL tokenizer

- Milestone: v1.1 Chat redesign
- Requirement: D-91; REDESIGN §5.2; highlight-sql.test.ts.
- Preconditions: mock mode against pnpm build && pnpm start.
- Steps:
  1. Run the listed spec or compare with the canvas.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Each token type, dollar quotes and comments are classified; every corpus SQL block round-trips exactly; 10,000 characters tokenize in under 20 ms.

### TC-172: Redesigned /eval and /how-it-works

- Milestone: v1.1 Chat redesign
- Requirement: D-91; REDESIGN §6, §7; eval-page.spec.ts; how-it-works.spec.ts.
- Preconditions: mock mode against pnpm build && pnpm start.
- Steps:
  1. Run the listed spec or compare with the canvas.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Grouped metric cards with gates, rerank values, trends and filter counts; four-step list, prose and Privacy and Limits cards; copy as REDESIGN §7.

### TC-173: App matches the design canvas

- Milestone: v1.1 Chat redesign
- Requirement: D-91; REDESIGN §9; Canvas comparison.
- Preconditions: mock mode against pnpm build && pnpm start.
- Steps:
  1. Run the listed spec or compare with the canvas.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Desktop chat with source viewer, welcome, phone sheet, states, /eval and /how-it-works match the canvas in light and dark themes.

## M5 Configuration seams (v2)

Source: PRD FR-59–FR-64, FR-67, FR-72, FR-74, §12 (M5), §16; TRD §28–§31, §23 (UT-32, UT-33, UT-49, IT-12, IT-13, IT-15, IT-16, E2E-26); implementation plan T-46–T-52; decisions D-92–D-95. Designed from the specs before the code.

| TC ID  | AC Reference             | TRD test ID / source | Title                                                         | Priority | Automatable | Expected result                                                                                                                                                                                                             |
| ------ | ------------------------ | -------------------- | ------------------------------------------------------------- | -------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-174 | T-46; FR-61; FR-72; D-92 | TRD §30.1; IT-15     | Migration 0003_kit applies on empty and v1 databases          | Critical | yes         | drizzle/0003_kit.sql matches TRD §30.1; pnpm db:migrate succeeds on an empty database and on a database holding the v1 example corpus; corpus_meta, ingest_items and the new columns exist; query_log.source accepts 'cli'. |
| TC-175 | T-46; FR-67; D-92        | IT-15                | Same chunk text in two documents is stored twice              | Critical | yes         | Ingesting two documents that share one chunk text stores two chunk rows, one per document, and both are returned by search; the conflict target is (document_id, content_hash).                                             |
| TC-176 | T-46; FR-37; NFR-16      | T-46 acceptance      | Re-ingest after the migration is a no-op                      | High     | yes         | Re-running pnpm ingest --offline on the example after 0003_kit reports 0 inserted, 0 updated, 0 deleted.                                                                                                                    |
| TC-177 | T-47; FR-59              | UT-32                | Kit configuration schema and error messages                   | Critical | yes         | Every rule in TRD §29.1–29.3 is enforced; an invalid sourced.config.ts stops with CONFIG_INVALID naming the field and the fix; secrets are rejected in the file.                                                            |
| TC-178 | T-47; FR-61              | IT-12                | Embedding column follows configured dimensions                | Critical | yes         | ensureCorpusSchema creates vector(768) and halfvec(3072) columns with HNSW indexes, is a no-op on the same hash and raises CORPUS_MISMATCH when the model or dimensions change, unless rebuilt.                             |
| TC-179 | T-47; FR-62              | IT-13                | Full-text language from configuration                         | High     | yes         | With a Turkish regconfig the keyword search finds hits that english misses; unsupported languages fall back to simple.                                                                                                      |
| TC-180 | T-47; FR-60              | T-47 acceptance      | Providers resolved per role; v1 example unchanged             | High     | yes         | getProvider no longer exists; getProviders resolves unset roles to chat; the example with a sourced.config.ts mirroring v1 constants passes E2E-01–E2E-25.                                                                  |
| TC-181 | T-48; FR-63              | UT-33                | Copy rendered from configuration                              | Critical | yes         | getCopy applies defaults and overrides; the example configuration reproduces the PRD §9 and REDESIGN §7 strings exactly.                                                                                                    |
| TC-182 | T-48; FR-63; NFR-11      | T-48 step 2          | Example system prompt byte-identical to v1                    | Critical | yes         | The rendered example system prompt equals the v1 prompt byte for byte, so PROMPT_VERSION is unchanged.                                                                                                                      |
| TC-183 | T-48; FR-74              | T-48 step 4          | No corpus literals outside allowed paths                      | High     | yes         | scripts/check-corpus-literals.ts fails on PostgreSQL, postgresql.org or 35 pages outside sourced.config.ts, corpus/, eval/, docs/, tests/ and qa/, and passes on the tree; it runs in the ci.yml static job.                |
| TC-184 | T-48; FR-17              | T-48 step 3          | Citation markers up to P9                                     | High     | yes         | Markers [P1]–[P9] parse; finalPassages above 9 is rejected by config validation.                                                                                                                                            |
| TC-185 | T-49; FR-60              | UT-49                | Gemini, Anthropic and Ollama providers with mocked transports | High     | yes         | Each provider maps errors like v1, passes options, uses maxRetries 0; a chat-only provider without an embedding provider is rejected with the list of embedding providers; no test makes a network call.                    |
| TC-186 | T-49; FR-60; A-19; D-94  | T-49 acceptance      | Manual live call per provider                                 | Medium   | no          | One live call each to Gemini, Anthropic and a local Ollama succeeds.                                                                                                                                                        |
| TC-187 | T-50; FR-74; NFR-16      | IT-16                | Example corpus in the kit layout with identical chunks        | Critical | yes         | After the move to corpus/postgres-17/ and the postgres-docbook preset, ingestion yields the same chunk hashes and counts as v1.                                                                                             |
| TC-188 | T-50; FR-46              | T-50 acceptance      | /eval reads results from the new path                         | High     | yes         | /eval renders the committed v1 results from eval/postgres-17/results/.                                                                                                                                                      |
| TC-189 | T-50; FR-41; D-94        | T-50 acceptance      | Example eval within maxRegression                             | Critical | no          | pnpm eval on the example (v1 chat model, judge in the free allowance) stays within maxRegression of the v1.0.0 run; cost recorded against the D-94 budget.                                                                  |
| TC-190 | T-51; FR-64              | T-51 acceptance      | Deployment profiles gate quotas, demo mode and cache          | Critical | yes         | public-demo keeps FR-26–FR-32; local shows no quota copy and no cache label and skips rate limits; private refuses to start without SOURCED_ACCESS_TOKEN.                                                                   |
| TC-191 | T-51; FR-64              | E2E-01–E2E-25        | Example unchanged in public-demo                              | High     | yes         | E2E-01–E2E-25 pass with the example's public-demo profile.                                                                                                                                                                  |
| TC-192 | T-52; FR-63; FR-62       | E2E-26               | Second fixture corpus end to end in mock mode                 | Critical | yes         | The Turkish folder fixture with its own sourced.config.ts ingests in mock mode and the ask page renders its configured copy with cited answers.                                                                             |
| TC-193 | T-52; PRD §12            | M5 exit              | M5 exit criteria                                              | High     | no          | Example behaves as v1.0.0 within the regression delta; the second fixture corpus runs end to end; milestone report written.                                                                                                 |

### TC-174: Migration 0003_kit applies on empty and v1 databases

- Milestone: M5 Configuration seams
- Requirement: T-46; FR-61; FR-72; D-92; TRD §30.1; IT-15.
- Preconditions: the corresponding task implemented on v2/kit; mock mode and the local database unless the case says otherwise.
- Steps:
  1. Apply migrations to an empty test database and to one seeded with the v1 corpus; inspect the catalog.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: drizzle/0003_kit.sql matches TRD §30.1; pnpm db:migrate succeeds on an empty database and on a database holding the v1 example corpus; corpus_meta, ingest_items and the new columns exist; query_log.source accepts 'cli'.

### TC-175: Same chunk text in two documents is stored twice

- Milestone: M5 Configuration seams
- Requirement: T-46; FR-67; D-92; IT-15.
- Preconditions: the corresponding task implemented on v2/kit; mock mode and the local database unless the case says otherwise.
- Steps:
  1. Run IT-15.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Ingesting two documents that share one chunk text stores two chunk rows, one per document, and both are returned by search; the conflict target is (document_id, content_hash).

### TC-176: Re-ingest after the migration is a no-op

- Milestone: M5 Configuration seams
- Requirement: T-46; FR-37; NFR-16; T-46 acceptance.
- Preconditions: the corresponding task implemented on v2/kit; mock mode and the local database unless the case says otherwise.
- Steps:
  1. Ingest twice on the migrated local database.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Re-running pnpm ingest --offline on the example after 0003_kit reports 0 inserted, 0 updated, 0 deleted.

### TC-177: Kit configuration schema and error messages

- Milestone: M5 Configuration seams
- Requirement: T-47; FR-59; UT-32.
- Preconditions: the corresponding task implemented on v2/kit; mock mode and the local database unless the case says otherwise.
- Steps:
  1. Run UT-32.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Every rule in TRD §29.1–29.3 is enforced; an invalid sourced.config.ts stops with CONFIG_INVALID naming the field and the fix; secrets are rejected in the file.

### TC-178: Embedding column follows configured dimensions

- Milestone: M5 Configuration seams
- Requirement: T-47; FR-61; IT-12.
- Preconditions: the corresponding task implemented on v2/kit; mock mode and the local database unless the case says otherwise.
- Steps:
  1. Run IT-12.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: ensureCorpusSchema creates vector(768) and halfvec(3072) columns with HNSW indexes, is a no-op on the same hash and raises CORPUS_MISMATCH when the model or dimensions change, unless rebuilt.

### TC-179: Full-text language from configuration

- Milestone: M5 Configuration seams
- Requirement: T-47; FR-62; IT-13.
- Preconditions: the corresponding task implemented on v2/kit; mock mode and the local database unless the case says otherwise.
- Steps:
  1. Run IT-13.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: With a Turkish regconfig the keyword search finds hits that english misses; unsupported languages fall back to simple.

### TC-180: Providers resolved per role; v1 example unchanged

- Milestone: M5 Configuration seams
- Requirement: T-47; FR-60; T-47 acceptance.
- Preconditions: the corresponding task implemented on v2/kit; mock mode and the local database unless the case says otherwise.
- Steps:
  1. grep for getProvider; run the unit tests and the E2E suite.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: getProvider no longer exists; getProviders resolves unset roles to chat; the example with a sourced.config.ts mirroring v1 constants passes E2E-01–E2E-25.

### TC-181: Copy rendered from configuration

- Milestone: M5 Configuration seams
- Requirement: T-48; FR-63; UT-33.
- Preconditions: the corresponding task implemented on v2/kit; mock mode and the local database unless the case says otherwise.
- Steps:
  1. Run UT-33.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: getCopy applies defaults and overrides; the example configuration reproduces the PRD §9 and REDESIGN §7 strings exactly.

### TC-182: Example system prompt byte-identical to v1

- Milestone: M5 Configuration seams
- Requirement: T-48; FR-63; NFR-11; T-48 step 2.
- Preconditions: the corresponding task implemented on v2/kit; mock mode and the local database unless the case says otherwise.
- Steps:
  1. Render the prompt from the example config and diff with the v1 constant.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: The rendered example system prompt equals the v1 prompt byte for byte, so PROMPT_VERSION is unchanged.

### TC-183: No corpus literals outside allowed paths

- Milestone: M5 Configuration seams
- Requirement: T-48; FR-74; T-48 step 4.
- Preconditions: the corresponding task implemented on v2/kit; mock mode and the local database unless the case says otherwise.
- Steps:
  1. Run the script on the tree and on a temporary violating file.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: scripts/check-corpus-literals.ts fails on PostgreSQL, postgresql.org or 35 pages outside sourced.config.ts, corpus/, eval/, docs/, tests/ and qa/, and passes on the tree; it runs in the ci.yml static job.

### TC-184: Citation markers up to P9

- Milestone: M5 Configuration seams
- Requirement: T-48; FR-17; T-48 step 3.
- Preconditions: the corresponding task implemented on v2/kit; mock mode and the local database unless the case says otherwise.
- Steps:
  1. Unit tests on the citation parser and config schema.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Markers [P1]–[P9] parse; finalPassages above 9 is rejected by config validation.

### TC-185: Gemini, Anthropic and Ollama providers with mocked transports

- Milestone: M5 Configuration seams
- Requirement: T-49; FR-60; UT-49.
- Preconditions: the corresponding task implemented on v2/kit; mock mode and the local database unless the case says otherwise.
- Steps:
  1. Run UT-49.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Each provider maps errors like v1, passes options, uses maxRetries 0; a chat-only provider without an embedding provider is rejected with the list of embedding providers; no test makes a network call.

### TC-186: Manual live call per provider

- Milestone: M5 Configuration seams
- Requirement: T-49; FR-60; A-19; D-94; T-49 acceptance.
- Preconditions: the corresponding task implemented on v2/kit; mock mode and the local database unless the case says otherwise.
- Steps:
  1. Owner action: the owner has no keys and no Ollama (D-94); listed in PROGRESS open questions.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: One live call each to Gemini, Anthropic and a local Ollama succeeds.

### TC-187: Example corpus in the kit layout with identical chunks

- Milestone: M5 Configuration seams
- Requirement: T-50; FR-74; NFR-16; IT-16.
- Preconditions: the corresponding task implemented on v2/kit; mock mode and the local database unless the case says otherwise.
- Steps:
  1. Run IT-16.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: After the move to corpus/postgres-17/ and the postgres-docbook preset, ingestion yields the same chunk hashes and counts as v1.

### TC-188: /eval reads results from the new path

- Milestone: M5 Configuration seams
- Requirement: T-50; FR-46; T-50 acceptance.
- Preconditions: the corresponding task implemented on v2/kit; mock mode and the local database unless the case says otherwise.
- Steps:
  1. E2E eval-page spec against the moved files.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: /eval renders the committed v1 results from eval/postgres-17/results/.

### TC-189: Example eval within maxRegression

- Milestone: M5 Configuration seams
- Requirement: T-50; FR-41; D-94; T-50 acceptance.
- Preconditions: the corresponding task implemented on v2/kit; mock mode and the local database unless the case says otherwise.
- Steps:
  1. Run the eval through eval.yml on the v2 draft PR.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: pnpm eval on the example (v1 chat model, judge in the free allowance) stays within maxRegression of the v1.0.0 run; cost recorded against the D-94 budget.

### TC-190: Deployment profiles gate quotas, demo mode and cache

- Milestone: M5 Configuration seams
- Requirement: T-51; FR-64; T-51 acceptance.
- Preconditions: the corresponding task implemented on v2/kit; mock mode and the local database unless the case says otherwise.
- Steps:
  1. Unit tests per profile; a local-profile E2E run.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: public-demo keeps FR-26–FR-32; local shows no quota copy and no cache label and skips rate limits; private refuses to start without SOURCED_ACCESS_TOKEN.

### TC-191: Example unchanged in public-demo

- Milestone: M5 Configuration seams
- Requirement: T-51; FR-64; E2E-01–E2E-25.
- Preconditions: the corresponding task implemented on v2/kit; mock mode and the local database unless the case says otherwise.
- Steps:
  1. Run the full E2E suite.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: E2E-01–E2E-25 pass with the example's public-demo profile.

### TC-192: Second fixture corpus end to end in mock mode

- Milestone: M5 Configuration seams
- Requirement: T-52; FR-63; FR-62; E2E-26.
- Preconditions: the corresponding task implemented on v2/kit; mock mode and the local database unless the case says otherwise.
- Steps:
  1. Run E2E-26.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: The Turkish folder fixture with its own sourced.config.ts ingests in mock mode and the ask page renders its configured copy with cited answers.

### TC-193: M5 exit criteria

- Milestone: M5 Configuration seams
- Requirement: T-52; PRD §12; M5 exit.
- Preconditions: the corresponding task implemented on v2/kit; mock mode and the local database unless the case says otherwise.
- Steps:
  1. Review TC-174–TC-192 results and write qa/m5-report.md.
  2. Assert the expected outcome and record evidence in the ledger.
- Expected: Example behaves as v1.0.0 within the regression delta; the second fixture corpus runs end to end; milestone report written.
