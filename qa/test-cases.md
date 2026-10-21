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
- Steps: Navigate to /does-not-exist.
- Expected: Exact Page not found heading, body and link.

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
